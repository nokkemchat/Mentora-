import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

export async function crawlDirectory(baseUrl: string, maxDepth: number = 6): Promise<string[]> {
  const pdfLinks: Set<string> = new Set();
  const visited: Set<string> = new Set();

  async function crawl(url: string, depth: number) {
    if (depth > maxDepth || visited.has(url)) return;
    visited.add(url);

    try {
      console.log(`Crawling: ${url}`);
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(data);
      const links: string[] = [];
      
      $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          links.push(href);
        }
      });

      for (const href of links) {
        // Resolve relative URLs
        let resolvedUrl: string;
        try {
          resolvedUrl = new URL(href, url).href;
        } catch (e) {
          continue;
        }

        // Only stay within the same base domain
        if (!resolvedUrl.startsWith(baseUrl)) continue;

        if (resolvedUrl.toLowerCase().endsWith('.pdf')) {
          pdfLinks.add(resolvedUrl);
        } else if (resolvedUrl.endsWith('/') && resolvedUrl.length > url.length) {
          // It's a subdirectory
          await crawl(resolvedUrl, depth + 1);
        }
      }
    } catch (error: any) {
      console.error(`Failed to crawl ${url}: ${error.message}`);
    }
  }

  await crawl(baseUrl, 0);
  return Array.from(pdfLinks);
}
