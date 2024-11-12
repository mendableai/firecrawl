package main

import (
	"C"
	// "log"

	md "github.com/tomkosm/html-to-markdown"
	"github.com/tomkosm/html-to-markdown/plugin"
)

//export ConvertHTMLToMarkdown
func ConvertHTMLToMarkdown(html *C.char) *C.char {
	converter := md.NewConverter("", true, nil)
	converter.Use(plugin.GitHubFlavored())

	markdown, err := converter.ConvertString(C.GoString(html))
	if err != nil {
		// log.Fatal(err)
	}
	return C.CString(markdown)
}

func main() {
	// This function is required for the main package
}
