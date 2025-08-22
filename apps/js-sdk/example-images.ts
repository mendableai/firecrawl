/**
 * Image Extraction Examples - Firecrawl JS/TS SDK v2
 * 
 * This example demonstrates how to use the new 'images' format
 * to extract all images from webpages.
 */

import Firecrawl from './firecrawl/src/index';

const run = async () => {
  const apiKey = (globalThis as any).process?.env?.FIRECRAWL_API_KEY || 'fc-YOUR_API_KEY';
  const apiUrl = (globalThis as any).process?.env?.FIRECRAWL_API_URL || 'https://api.firecrawl.dev';
  const client = new Firecrawl({ apiKey, apiUrl });

  console.log('🖼️  Image Extraction Examples');
  console.log('============================\n');

  try {
    // Example 1: Extract only images
    console.log('1. Extract only images from a webpage:');
    const imagesOnly = await client.scrape('https://news.ycombinator.com', { 
      formats: ['images'] 
    });
    
    console.log(`   Found ${imagesOnly.images?.length || 0} images:`);
    imagesOnly.images?.slice(0, 3).forEach((img, i) => {
      console.log(`   ${i + 1}. ${img}`);
    });
    if ((imagesOnly.images?.length || 0) > 3) {
      console.log(`   ... and ${(imagesOnly.images?.length || 0) - 3} more`);
    }

    // Example 2: Extract images + content + links
    console.log('\n2. Extract images along with content and links:');
    const comprehensive = await client.scrape('https://github.com', { 
      formats: ['markdown', 'links', 'images'] 
    });

    console.log(`   Markdown content: ${comprehensive.markdown?.length || 0} characters`);
    console.log(`   Links found: ${comprehensive.links?.length || 0}`);
    console.log(`   Images found: ${comprehensive.images?.length || 0}`);

    // Example 3: Show the value of images vs links
    console.log('\n3. Comparison: Images vs Links with image extensions:');
    if (comprehensive.links && comprehensive.images) {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];
      const linkImages = comprehensive.links.filter(link => 
        imageExtensions.some(ext => link.toLowerCase().includes(ext))
      );
      
      console.log(`   Links that look like images: ${linkImages.length}`);
      console.log(`   Actual images found: ${comprehensive.images.length}`);
      console.log(`   Additional images discovered: ${comprehensive.images.length - linkImages.length}`);
      
      // Show images that wouldn't be found via links
      const uniqueImages = comprehensive.images.filter(img => 
        !comprehensive.links?.includes(img)
      );
      
      if (uniqueImages.length > 0) {
        console.log(`\n   Images not in links (from meta tags, CSS, etc.):`);
        uniqueImages.slice(0, 2).forEach(img => {
          console.log(`   - ${img}`);
        });
      }
    }

    // Example 4: Boolean format syntax
    console.log('\n4. Using boolean format syntax:');
    const booleanSyntax = await client.scrape('https://httpbin.org/html', {
      formats: {
        markdown: true,
        images: true,
        links: false,
        html: false
      } as any // Type assertion for compatibility
    });

    console.log(`   Images found: ${booleanSyntax.images?.length || 0}`);

  } catch (error) {
    console.error('Error:', error);
  }
};

// TypeScript usage examples
export const typeScriptExamples = {
  // Type-safe image extraction
  async extractImages(client: Firecrawl, url: string): Promise<string[]> {
    const result = await client.scrape(url, { formats: ['images'] });
    return result.images || [];
  },

  // Comprehensive extraction with type safety
  async extractAll(client: Firecrawl, url: string) {
    const result = await client.scrape(url, { 
      formats: ['markdown', 'links', 'images'] 
    });

    return {
      content: result.markdown || '',
      links: result.links || [],
      images: result.images || [],
      title: result.metadata?.title || 'Untitled'
    };
  }
};

// Run examples if this file is executed directly
if (require.main === module) {
  run().catch(console.error);
}
