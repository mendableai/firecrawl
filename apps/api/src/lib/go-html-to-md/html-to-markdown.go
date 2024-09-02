package main

import (
	"flag"
	"fmt"
	"log"
	"sync"

	md "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/JohannesKaufmann/html-to-markdown/plugin"
)

func convertHTMLToMarkdown(html string, wg *sync.WaitGroup, results chan<- string) {
	defer wg.Done()
	converter := md.NewConverter("", true, nil)
	converter.Use(plugin.GitHubFlavored())

	markdown, err := converter.ConvertString(html)
	if err != nil {
		log.Fatal(err)
	}
	results <- markdown
}

func main() {
	html := flag.String("html", "", "")
	flag.Parse()

	var wg sync.WaitGroup
	results := make(chan string, 1)

	wg.Add(1)
	go convertHTMLToMarkdown(*html, &wg, results)

	wg.Wait()
	close(results)

	for markdown := range results {
		fmt.Println(markdown)
	}
}
