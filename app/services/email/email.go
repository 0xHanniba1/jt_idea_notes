package email

import (
	"regexp"
	"strings"

	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/pkg/env"
)

// NoReply is the default 'from' address
var NoReply = env.Config.Email.NoReply

var allowlist = env.Config.Email.Allowlist
var allowlistRegex = regexp.MustCompile(allowlist)
var blocklist = env.Config.Email.Blocklist
var blocklistRegex = regexp.MustCompile(blocklist)

// SetAllowlist can be used to change email allowlist during runtime
func SetAllowlist(s string) {
	allowlist = s
	allowlistRegex = regexp.MustCompile(allowlist)
}

// SetBlocklist can be used to change email blocklist during runtime
func SetBlocklist(s string) {
	blocklist = s
	blocklistRegex = regexp.MustCompile(blocklist)
}

// CanSendTo returns true if Fider is allowed to send email to given address
func CanSendTo(address string) bool {
	if strings.TrimSpace(address) == "" {
		return false
	}

	if allowlist != "" {
		return allowlistRegex.MatchString(address)
	}

	if blocklist != "" {
		return !blocklistRegex.MatchString(address)
	}

	return true
}

// NonEmptyRecipients keeps valid delivery targets without letting a missing
// contact email stop delivery to the remaining members of a batch.
func NonEmptyRecipients(recipients []dto.Recipient) []dto.Recipient {
	result := make([]dto.Recipient, 0, len(recipients))
	for _, recipient := range recipients {
		if strings.TrimSpace(recipient.Address) != "" {
			result = append(result, recipient)
		}
	}
	return result
}
