package passwordauth

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestLimiterReservesConcurrentFailuresAndExpires(t *testing.T) {
	l := NewLimiter()
	now := time.Now()
	l.now = func() time.Time { return now }
	var finishes []func(bool)
	for i := 0; i < 10; i++ {
		done, _ := l.Start(1, "member", "127.0.0.1")
		if done == nil {
			t.Fatal("early rejection")
		}
		finishes = append(finishes, done)
	}
	if done, _ := l.Start(1, "member", "127.0.0.2"); done != nil {
		t.Fatal("pending attempts bypassed account limit")
	}
	var wg sync.WaitGroup
	for _, done := range finishes {
		wg.Add(1)
		go func(done func(bool)) { defer wg.Done(); done(false); done(false) }(done)
	}
	wg.Wait()
	if done, _ := l.Start(1, "member", "127.0.0.3"); done != nil {
		t.Fatal("failed attempts not retained")
	}
	if done, _ := l.Start(2, "member", "127.0.0.3"); done == nil {
		t.Fatal("tenant boundaries mixed")
	} else {
		done(true)
	}
	now = now.Add(16 * time.Minute)
	if done, _ := l.Start(1, "member", "127.0.0.1"); done == nil {
		t.Fatal("expired limit did not reset")
	} else {
		done(true)
	}
}

func TestLimiterIPBudgetAndBoundedHashQueue(t *testing.T) {
	l := NewLimiter()
	for i := 0; i < 120; i++ {
		done, _ := l.Start(1, "member", "ip")
		if done == nil {
			t.Fatal("unexpected limit")
		}
		done(true)
	}
	if done, _ := l.Start(1, "another", "ip"); done != nil {
		t.Fatal("account change bypassed IP budget")
	}
	releases := make([]func(), 2)
	for i := range releases {
		var ok bool
		releases[i], ok = l.Acquire(context.Background())
		if !ok {
			t.Fatal("no initial hash slot")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if release, ok := l.Acquire(ctx); ok {
		release()
		t.Fatal("canceled wait accepted")
	}
	for _, release := range releases {
		release()
		release()
	}
	if release, ok := l.Acquire(context.Background()); !ok {
		t.Fatal("hash capacity leaked")
	} else {
		release()
	}
}
