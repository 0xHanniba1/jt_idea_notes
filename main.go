package main

import (
	"fmt"
	"os"

	"github.com/getfider/fider/app/cmd"
	_ "github.com/lib/pq"
)

func main() {
	args := os.Args[1:]
	if len(args) > 0 && args[0] == "ping" {
		os.Exit(cmd.RunPing())
	} else if len(args) > 0 && args[0] == "migrate" {
		os.Exit(cmd.RunMigrate())
	} else if len(args) > 0 && args[0] == "account" {
		os.Exit(cmd.RunAccount(args[1:]))
	} else if len(args) > 0 {
		fmt.Fprintln(os.Stderr, "Unknown command. Use account, migrate, or ping.")
		os.Exit(1)
	} else {
		os.Exit(cmd.RunServer())
	}
}
