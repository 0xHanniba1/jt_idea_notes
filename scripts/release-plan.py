#!/usr/bin/env python3
"""Read GitHub release evidence; never connect to or mutate a deployment target."""
import argparse
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

REPOSITORY = '0xHanniba1/jt_idea_notes'
IMAGE = 'ghcr.io/0xhanniba1/jt_idea_notes'


def api(path, binary=False):
    result = subprocess.run(
        ['gh', 'api', '--method', 'GET', f'repos/{REPOSITORY}/{path}'],
        check=True, capture_output=True,
    )
    return result.stdout if binary else json.loads(result.stdout)


def validate_run(run, *, path, event):
    if (run.get('path') != path or run.get('event') != event
            or run.get('status') != 'completed' or run.get('conclusion') != 'success'
            or run.get('repository', {}).get('full_name') != REPOSITORY
            or run.get('head_repository', {}).get('full_name') != REPOSITORY
            or run.get('head_branch') != 'main'):
        raise ValueError('Release evidence must come from a successful main workflow in this repository')


def validate_receipt(receipt, commit, publish, build):
    validate_run(publish, path='.github/workflows/publish.yml', event='workflow_run')
    validate_run(build, path='.github/workflows/build.yml', event='push')
    expected = {
        'schema': 1, 'repository': REPOSITORY, 'commit': commit,
        'platform': 'linux/amd64', 'tag': f'{IMAGE}:sha-{commit}',
        'publish_run_id': publish['id'], 'publish_run_attempt': publish['run_attempt'],
        'build_run_id': build['id'], 'build_run_attempt': build['run_attempt'],
        'cloud_deployed': False,
    }
    if any(receipt.get(key) != value for key, value in expected.items()):
        raise ValueError('Receipt does not match the requested commit and workflow attempts')
    if build.get('head_sha') != commit:
        raise ValueError('Build tested a different commit')
    if not re.fullmatch(re.escape(IMAGE) + r'@sha256:[0-9a-f]{64}', receipt.get('image', '')):
        raise ValueError('Receipt is missing a pinned registry digest')
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', receipt.get('image_id', '')):
        raise ValueError('Receipt is missing the tested image ID')


def read_receipt(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.namelist() != ['release.json'] or archive.getinfo('release.json').file_size > 65536:
            raise ValueError('Unexpected release receipt archive')
        return json.loads(archive.read('release.json'))


def plan(commit):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Supply the full 40-character commit SHA, not a branch, tag or short SHA')
    comparison = api(f'compare/{commit}...main')
    if (comparison.get('status') not in ('ahead', 'identical')
            or comparison.get('merge_base_commit', {}).get('sha') != commit):
        raise ValueError('Requested commit is not on main')
    name = 'release-sha-' + commit
    artifacts = api(f'actions/artifacts?name={name}&per_page=100')['artifacts']
    candidates = [a for a in artifacts if a['name'] == name and not a['expired']]
    for artifact in sorted(candidates, key=lambda a: a['id'], reverse=True):
        publish = api(f"actions/runs/{artifact['workflow_run']['id']}")
        if publish.get('status') != 'completed' or publish.get('conclusion') != 'success':
            continue
        receipt = read_receipt(api(f"actions/artifacts/{artifact['id']}/zip", binary=True))
        build_id = receipt.get('build_run_id')
        if type(build_id) is not int or build_id <= 0:
            raise ValueError('Invalid source build run ID')
        build = api(f'actions/runs/{build_id}')
        validate_receipt(receipt, commit, publish, build)
        return {
            **receipt,
            'build_url': f'https://github.com/{REPOSITORY}/actions/runs/{build["id"]}',
            'publish_url': f'https://github.com/{REPOSITORY}/actions/runs/{publish["id"]}',
            'receipt_artifact_id': artifact['id'],
            'cloud_release_authorized': False,
            'server_contacted': False,
            'next': 'Wait for explicit cloud release instruction, then inspect cloud state, backup and migration compatibility.',
        }
    raise ValueError('No successful, unexpired release receipt found. Do not deploy an unverified tag.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('commit', help='Full main commit SHA to release')
    parser.add_argument('--output', type=Path, help='Save a NEW local plan file; existing files are never overwritten')
    args = parser.parse_args()
    try:
        content = json.dumps(plan(args.commit), indent=2, ensure_ascii=False) + '\n'
        if args.output:
            with args.output.open('x') as output:
                output.write(content)
        else:
            print(content, end='')
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        print(f'Release plan refused: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
