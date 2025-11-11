// Test script for Go sandbox
// Verifies environment variables and basic functionality
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

func main() {
	fmt.Println("=== Go Sandbox Test ===")
	fmt.Printf("Go version: %s\n", runtime.Version())
	fmt.Println()

	// Test environment variables
	fmt.Println("=== Environment Variables ===")
	caseID := getEnv("CASE_ID", "NOT_SET")
	evidenceUID := getEnv("EVIDENCE_UID", "NOT_SET")
	evidencePath := getEnv("EVIDENCE_PATH", "NOT_SET")
	outputDir := getEnv("OUTPUT_DIR", "NOT_SET")

	fmt.Printf("CASE_ID: %s\n", caseID)
	fmt.Printf("EVIDENCE_UID: %s\n", evidenceUID)
	fmt.Printf("EVIDENCE_PATH: %s\n", evidencePath)
	fmt.Printf("OUTPUT_DIR: %s\n", outputDir)
	fmt.Println()

	// Test output directory write
	if outputDir != "NOT_SET" {
		outputPath := filepath.Join(outputDir, "test_output_go.txt")
		content := fmt.Sprintf("Test output from Go sandbox\nCase ID: %s\nEvidence UID: %s\n", caseID, evidenceUID)

		err := os.WriteFile(outputPath, []byte(content), 0644)
		if err != nil {
			fmt.Printf("✗ Output write failed: %v\n", err)
		} else {
			fmt.Printf("✓ Output file written: %s\n", outputPath)
		}
	} else {
		fmt.Println("⚠ OUTPUT_DIR not set, skipping file write test")
	}

	fmt.Println()
	fmt.Println("=== Test Complete ===")
	fmt.Println("Exit code: 0")
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
