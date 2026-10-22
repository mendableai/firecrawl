package main

import (
	"strings"

	"github.com/PuerkitoBio/goquery"
	md "github.com/firecrawl/html-to-markdown"
	"github.com/firecrawl/html-to-markdown/plugin"
)

// Converter handles HTML to Markdown conversion
type Converter struct {
	converter *md.Converter
}

// NewConverter creates a new Converter instance with pre-configured rules
func NewConverter() *Converter {
	converter := md.NewConverter("", true, nil)
	converter.Use(plugin.GitHubFlavored())
	converter.Use(plugin.RobustCodeBlock())
	converter.AddRules(definitionListRules...)

	return &Converter{
		converter: converter,
	}
}

// ConvertHTMLToMarkdown converts HTML string to Markdown
func (c *Converter) ConvertHTMLToMarkdown(html string) (string, error) {
	return c.converter.ConvertString(html)
}

// definitionListRules write a <dl> as a definition list: each term on a line of
// its own and each definition after ": ", with its further lines indented, as
// Pandoc, PHP Markdown Extra and kramdown read it. The converter has no rule for
// these elements, so a term ran into its definition ("TermDefinition").
var definitionListRules = []md.Rule{
	{
		Filter: []string{"dl"},
		Replacement: func(content string, selec *goquery.Selection, opt *md.Options) *string {
			return md.String("\n\n" + strings.TrimSpace(content) + "\n\n")
		},
	},
	{
		Filter: []string{"dt"},
		Replacement: func(content string, selec *goquery.Selection, opt *md.Options) *string {
			term := strings.TrimSpace(content)
			if term == "" {
				return md.String("")
			}
			// Terms that share a definition stay on consecutive lines.
			if goquery.NodeName(selec.Prev()) == "dt" {
				return md.String("\n" + term)
			}
			return md.String("\n\n" + term)
		},
	},
	{
		Filter: []string{"dd"},
		Replacement: func(content string, selec *goquery.Selection, opt *md.Options) *string {
			lines := strings.Split(strings.TrimSpace(content), "\n")
			if lines[0] == "" {
				return md.String("")
			}
			for i := 1; i < len(lines); i++ {
				if lines[i] != "" {
					lines[i] = "    " + lines[i]
				}
			}
			return md.String("\n: " + strings.Join(lines, "\n"))
		},
	},
}
