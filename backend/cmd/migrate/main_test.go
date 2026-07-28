package main

import "testing"

func TestSplitSQLStatementsKeepsStatementAfterComment(t *testing.T) {
	statements := splitSQLStatements(`
-- comment
CREATE TABLE IF NOT EXISTS test_one (id INT);

-- another comment
CREATE TABLE IF NOT EXISTS test_two (id INT);
`)
	if len(statements) != 2 {
		t.Fatalf("expected 2 statements, got %d: %#v", len(statements), statements)
	}
	if statements[0] != "CREATE TABLE IF NOT EXISTS test_one (id INT)" {
		t.Fatalf("unexpected first statement: %q", statements[0])
	}
}
