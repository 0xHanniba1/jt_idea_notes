"""Offline release boundary tests: no registry, server or database writes."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('release_plan', Path(__file__).with_name('release-plan.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
SHA = 'a' * 40


class ReleasePlanTests(unittest.TestCase):
    def setUp(self):
        self.build = self.run_fixture(1, 'build.yml', 'push')
        self.publish = self.run_fixture(2, 'publish.yml', 'workflow_run')
        # workflow_run HEAD can advance while the tested main commit remains pinned.
        self.publish['head_sha'] = 'b' * 40
        self.receipt = {
            'schema': 1, 'repository': release.REPOSITORY, 'commit': SHA,
            'platform': 'linux/amd64', 'tag': f'{release.IMAGE}:sha-{SHA}',
            'image': release.IMAGE + '@sha256:' + 'c' * 64,
            'image_id': 'sha256:' + 'd' * 64,
            'build_run_id': 1, 'build_run_attempt': 1,
            'publish_run_id': 2, 'publish_run_attempt': 1, 'cloud_deployed': False,
        }

    def run_fixture(self, run_id, filename, event):
        return {
            'id': run_id, 'run_attempt': 1, 'path': '.github/workflows/' + filename,
            'event': event, 'status': 'completed', 'conclusion': 'success',
            'repository': {'full_name': release.REPOSITORY},
            'head_repository': {'full_name': release.REPOSITORY},
            'head_branch': 'main', 'head_sha': SHA,
        }

    def validate(self):
        release.validate_receipt(self.receipt, SHA, self.publish, self.build)

    def test_valid_receipt_pins_tested_commit_not_newer_workflow_head(self):
        self.validate()

    def test_reject_pr_fork_other_branch_failure_and_wrong_workflow(self):
        changes = [
            ('event', 'pull_request'), ('head_branch', 'stable'),
            ('head_repository', {'full_name': 'other/fork'}),
            ('conclusion', 'failure'), ('path', '.github/workflows/other.yml'),
            ('head_sha', 'b' * 40), ('run_attempt', 2),
        ]
        for key, value in changes:
            with self.subTest(key=key):
                original = self.build[key]
                self.build[key] = value
                with self.assertRaises(ValueError):
                    self.validate()
                self.build[key] = original

    def test_reject_receipt_tampering(self):
        for key, value in [('commit', 'b' * 40), ('image', 'evil/image@sha256:' + 'c' * 64),
                           ('cloud_deployed', True), ('platform', 'linux/arm64'),
                           ('publish_run_id', 3), ('image_id', 'missing')]:
            with self.subTest(key=key):
                original = self.receipt[key]
                self.receipt[key] = value
                with self.assertRaises(ValueError):
                    self.validate()
                self.receipt[key] = original

    def archive(self, filename='release.json'):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            archive.writestr(filename, json.dumps(self.receipt))
        return data.getvalue()

    def test_plan_reads_only_evidence_and_never_authorizes_deployment(self):
        artifact = {'id': 3, 'name': 'release-sha-' + SHA, 'expired': False, 'workflow_run': {'id': 2}}
        responses = [
            {'status': 'ahead', 'merge_base_commit': {'sha': SHA}},
            {'artifacts': [artifact]}, self.publish, self.archive(), self.build,
        ]
        with patch.object(release, 'api', side_effect=responses) as api:
            result = release.plan(SHA)
        self.assertEqual(result['image'], self.receipt['image'])
        self.assertFalse(result['cloud_release_authorized'])
        self.assertFalse(result['server_contacted'])
        self.assertEqual(api.call_count, 5)

    def test_invalid_commit_rejected_without_network(self):
        with patch.object(release, 'api') as api:
            with self.assertRaises(ValueError):
                release.plan('main')
            api.assert_not_called()

    def test_non_main_or_missing_receipt_refused(self):
        for responses in [
            [{'status': 'diverged', 'merge_base_commit': {'sha': 'b' * 40}}],
            [{'status': 'identical', 'merge_base_commit': {'sha': SHA}}, {'artifacts': []}],
        ]:
            with patch.object(release, 'api', side_effect=responses):
                with self.assertRaises(ValueError):
                    release.plan(SHA)

    def test_archive_does_not_extract_arbitrary_files(self):
        with self.assertRaises(ValueError):
            release.read_receipt(self.archive('../release.json'))


if __name__ == '__main__':
    unittest.main()
