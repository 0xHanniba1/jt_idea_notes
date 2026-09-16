package actions

import (
	"context"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/validate"
)

type CreateEditWebhook struct {
	Name        string             `json:"name"`
	Type        enum.WebhookType   `json:"type"`
	Status      enum.WebhookStatus `json:"status"`
	Url         string             `json:"url"`
	Content     string             `json:"content"`
	HttpMethod  string             `json:"http_method"`
	HttpHeaders entity.HttpHeaders `json:"http_headers"`
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *CreateEditWebhook) IsAuthorized(_ context.Context, user *entity.User) bool {
	return user != nil && user.IsAdministrator()
}

// Validate if current model is valid
func (action *CreateEditWebhook) Validate(ctx context.Context, _ *entity.User) *validate.Result {
	result := validate.Success()

	if action.Name == "" {
		result.AddFieldFailure("name", i18n.T(ctx, "admin.webhooks.validation.name.required"))
	} else if len(action.Name) > 60 {
		result.AddFieldFailure("name", i18n.T(ctx, "admin.webhooks.validation.name.length"))
	}

	if action.Type == 0 {
		result.AddFieldFailure("type", i18n.T(ctx, "admin.webhooks.validation.type.required"))
	} else if action.Type != enum.WebhookNewPost &&
		action.Type != enum.WebhookNewComment &&
		action.Type != enum.WebhookChangeStatus &&
		action.Type != enum.WebhookDeletePost {
		result.AddFieldFailure("type", i18n.T(ctx, "admin.webhooks.validation.type.invalid"))
	}

	if action.Status == 0 {
		result.AddFieldFailure("status", i18n.T(ctx, "admin.webhooks.validation.status.required"))
	}

	runCompileCheck := action.Status == enum.WebhookEnabled
	if action.Url == "" {
		result.AddFieldFailure("url", i18n.T(ctx, "admin.webhooks.validation.url.required"))
		runCompileCheck = false
	} else if len(action.Url) > 1_000 {
		result.AddFieldFailure("url", i18n.T(ctx, "admin.webhooks.validation.url.length"))
		runCompileCheck = false
	}

	if len(action.Content) > 100_000 {
		result.AddFieldFailure("content", i18n.T(ctx, "admin.webhooks.validation.content.template.length"))
		runCompileCheck = false
	}

	if runCompileCheck {
		previewWebhook := &cmd.PreviewWebhook{
			Type:    action.Type,
			Url:     action.Url,
			Content: action.Content,
		}
		if err := bus.Dispatch(ctx, previewWebhook); err != nil {
			return validate.Error(err)
		}

		if previewWebhook.Result.Url.Error != "" {
			result.AddFieldFailure("url", i18n.T(ctx, "admin.webhooks.validation.url.compile"))
		} else if messages := validate.WebhookURLLocalized(ctx, previewWebhook.Result.Url.Value); len(messages) > 0 {
			result.AddFieldFailure("url", messages...)
		}

		if previewWebhook.Result.Content.Error != "" {
			result.AddFieldFailure("content", i18n.T(ctx, "admin.webhooks.validation.content.compile"))
		}
	}

	if action.HttpMethod == "" {
		result.AddFieldFailure("http_method", i18n.T(ctx, "admin.webhooks.validation.method.required"))
	} else if len(action.HttpMethod) > 50 {
		result.AddFieldFailure("http_method", i18n.T(ctx, "admin.webhooks.validation.method.length"))
	}

	if len(action.Content) > 10_000 {
		result.AddFieldFailure("content", i18n.T(ctx, "admin.webhooks.validation.content.length"))
	}

	for header, value := range action.HttpHeaders {
		if header == "" {
			result.AddFieldFailure("header-"+header, i18n.T(ctx, "admin.webhooks.validation.header.name.required"))
		} else if len(header) > 200 {
			result.AddFieldFailure("header-"+header, i18n.T(ctx, "admin.webhooks.validation.header.name.length"))
		}

		if value == "" {
			result.AddFieldFailure("value-"+header, i18n.T(ctx, "admin.webhooks.validation.header.value.required"))
		} else if len(value) > 1_000 {
			result.AddFieldFailure("value-"+header, i18n.T(ctx, "admin.webhooks.validation.header.value.length"))
		}
	}

	return result
}

type PreviewWebhook struct {
	Type    enum.WebhookType `json:"type"`
	Url     string           `json:"url"`
	Content string           `json:"content"`
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *PreviewWebhook) IsAuthorized(_ context.Context, user *entity.User) bool {
	return user != nil && user.IsAdministrator()
}

// Validate if current model is valid
func (action *PreviewWebhook) Validate(ctx context.Context, _ *entity.User) *validate.Result {
	result := validate.Success()

	if action.Type == 0 {
		result.AddFieldFailure("type", i18n.T(ctx, "admin.webhooks.validation.type.required"))
	} else if action.Type != enum.WebhookNewPost &&
		action.Type != enum.WebhookNewComment &&
		action.Type != enum.WebhookChangeStatus &&
		action.Type != enum.WebhookDeletePost {
		result.AddFieldFailure("type", i18n.T(ctx, "admin.webhooks.validation.type.invalid"))
	}

	return result
}
