-- Credentials are intentionally separate from users, which is included in the
-- regular site export. Existing user IDs and all historical content are kept.
CREATE TABLE user_credentials (
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username VARCHAR(32) NOT NULL,
    password_hash TEXT NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id),
    CONSTRAINT user_credentials_user_fk FOREIGN KEY (tenant_id, user_id)
        REFERENCES users (tenant_id, id),
    CONSTRAINT user_credentials_username_key UNIQUE (tenant_id, username),
    CONSTRAINT user_credentials_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
    CONSTRAINT user_credentials_hash_length CHECK (length(password_hash) BETWEEN 80 AND 256)
);
