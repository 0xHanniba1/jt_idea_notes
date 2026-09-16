package dbx

import (
	"database/sql"
	"errors"

	"github.com/getfider/fider/app"
	"github.com/lib/pq"
)

// SensitiveError retains only a SQLSTATE. PostgreSQL error messages/details can
// contain bound hashes or stamps, so the original error must not be wrapped.
type SensitiveError struct{ Code string }

func (e *SensitiveError) Error() string {
	if e.Code != "" {
		return "sensitive database operation failed (SQLSTATE " + e.Code + ")"
	}
	return "sensitive database operation failed"
}

func sensitiveError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return app.ErrNotFound
	}
	var pg *pq.Error
	if errors.As(err, &pg) {
		return &SensitiveError{Code: string(pg.Code)}
	}
	return &SensitiveError{}
}

// ExecuteSensitive never logs SQL or arguments, even when DEBUG is enabled.
func (trx *Trx) ExecuteSensitive(command string, args ...any) (int64, error) {
	result, err := trx.tx.ExecContext(trx.ctx, command, args...)
	if err != nil {
		return 0, sensitiveError(err)
	}
	rows, err := result.RowsAffected()
	return rows, sensitiveError(err)
}

func (trx *Trx) ScalarSensitive(data any, command string, args ...any) error {
	return sensitiveError(trx.tx.QueryRowContext(trx.ctx, command, args...).Scan(data))
}

func (trx *Trx) GetSensitive(data any, command string, args ...any) error {
	rows, err := trx.tx.QueryContext(trx.ctx, command, args...)
	if err != nil {
		return sensitiveError(err)
	}
	defer func() { _ = rows.Close() }()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return sensitiveError(err)
		}
		return app.ErrNotFound
	}
	columns, err := rows.Columns()
	if err != nil {
		return sensitiveError(err)
	}
	if err := rowMapper.Map(data, columns, rows.Scan); err != nil {
		return sensitiveError(err)
	}
	return nil
}
