const getRandomLinksFromContent = async (options: {
    content: string;
    excludes: string[];
    limit: number;
  }): Promise<string[]> => {
    const regex = /(?<=\()https:\/\/(.*?)(?=\))/g;
    const links = options.content.match(regex);
    const filteredLinks = links
      ? links.filter(
          (link) => !options.excludes.some((exclude) => link.includes(exclude))
        )
      : [];
    const uniqueLinks = [...new Set(filteredLinks)]; // Ensure all links are unique
    const randomLinks = [];
    while (randomLinks.length < options.limit && uniqueLinks.length > 0) {
      const randomIndex = Math.floor(Math.random() * uniqueLinks.length);
      randomLinks.push(uniqueLinks.splice(randomIndex, 1)[0]);
    }
    return randomLinks;
  };
  
  function fuzzyContains(options: {
    largeText: string;
    queryText: string;
    threshold?: number;
  }): boolean {
    // Normalize texts: lowercasing and removing non-alphanumeric characters
    const normalize = (text: string) =>
      text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  
    const normalizedLargeText = normalize(options.largeText);
    const normalizedQueryText = normalize(options.queryText);
  
    // Split the query into words
    const queryWords = normalizedQueryText.split(/\s+/);
  
    // Count how many query words are in the large text
    const matchCount = queryWords.reduce((count, word) => {
      return count + (normalizedLargeText.includes(word) ? 1 : 0);
    }, 0);
  
    // Calculate the percentage of words matched
    const matchPercentage = matchCount / queryWords.length;
  
    // Check if the match percentage meets or exceeds the threshold
    return matchPercentage >= (options.threshold || 0.8);
  }