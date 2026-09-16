package validate

import (
	"context"

	"github.com/getfider/fider/app/pkg/i18n"
)

// WebhookURLLocalized preserves WebhookURL validation and localizes its user-facing messages.
func WebhookURLLocalized(ctx context.Context, rawurl string) []string {
	messages := WebhookURL(rawurl)
	for index, message := range messages {
		switch message {
		case "This URL is not valid.":
			messages[index] = i18n.T(ctx, "admin.webhooks.validation.address.invalid")
		case "Only http and https URLs are allowed.":
			messages[index] = i18n.T(ctx, "admin.webhooks.validation.address.scheme")
		case "This URL is not allowed because it targets a private or internal network address.":
			messages[index] = i18n.T(ctx, "admin.webhooks.validation.address.private")
		case "Could not resolve the hostname in this URL.":
			messages[index] = i18n.T(ctx, "admin.webhooks.validation.address.resolve")
		}
	}
	return messages
}
