package main

import (
	"os"
	"strings"
	"testing"
)

func TestNoPlaceholderFrameTextureAssetReference(t *testing.T) {
	raw, err := os.ReadFile("../frontend/assets/css/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	placeholder := strings.Join([]string{"path", "to", "your", "frame-texture.jpg"}, "/")
	if strings.Contains(string(raw), placeholder) {
		t.Fatal("placeholder frame texture asset reference must not be present")
	}
}
