package passwordauth

import (
	"context"
	"strconv"
	"sync"
	"time"
)

type attemptWindow struct {
	until          time.Time
	count, pending int
}

// Limiter is process-local. It bounds memory and reserves pending attempts so
// concurrent failures cannot all pass a nearly exhausted account budget.
type Limiter struct {
	mu      sync.Mutex
	windows map[string]*attemptWindow
	now     func() time.Time
	active  chan struct{}
	queue   chan struct{}
}

func NewLimiter() *Limiter {
	return &Limiter{windows: make(map[string]*attemptWindow), now: time.Now, active: make(chan struct{}, 2), queue: make(chan struct{}, 18)}
}

func (l *Limiter) Start(tenant int, username, ip string) (func(bool), time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.windows) >= 10000 {
		for key, w := range l.windows {
			if !now.Before(w.until) && w.pending == 0 {
				delete(l.windows, key)
			}
		}
	}
	accountKey := "user:" + strconv.Itoa(tenant) + ":" + username
	ipKey := "ip:" + ip
	get := func(key string) *attemptWindow {
		w := l.windows[key]
		if w != nil && !now.Before(w.until) && w.pending == 0 {
			delete(l.windows, key)
			w = nil
		}
		if w == nil && len(l.windows) < 10000 {
			w = &attemptWindow{until: now.Add(15 * time.Minute)}
			l.windows[key] = w
		}
		return w
	}
	ipWindow := get(ipKey)
	if ipWindow == nil {
		return nil, time.Minute
	}
	if ipWindow.count >= 120 {
		return nil, ipWindow.until.Sub(now)
	}
	ipWindow.count++
	account := get(accountKey)
	if account == nil {
		return nil, time.Minute
	}
	if account.count+account.pending >= 10 {
		return nil, account.until.Sub(now)
	}
	account.pending++
	var once sync.Once
	return func(success bool) {
		once.Do(func() {
			l.mu.Lock()
			defer l.mu.Unlock()
			account.pending--
			if !success {
				account.count++
			}
		})
	}, 0
}

// Acquire bounds both expensive KDF operations and the number of waiting callers.
func (l *Limiter) Acquire(ctx context.Context) (func(), bool) {
	select {
	case l.queue <- struct{}{}:
	default:
		return nil, false
	}
	select {
	case l.active <- struct{}{}:
		var once sync.Once
		return func() { once.Do(func() { <-l.active; <-l.queue }) }, true
	case <-ctx.Done():
		<-l.queue
		return nil, false
	}
}
