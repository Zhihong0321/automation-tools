# Crawl4AI's /md and /health on loopback, for a Windows PC.
#
# The Mac mini runs Crawl4AI's own Docker image and worker.ts talks to its /md.
# A Windows PC has no Docker here (and no RAM for a Linux VM beside the Maps and
# step-2 workers), but Crawl4AI is also a plain Python package that drives a
# local Chromium. This file serves the two endpoints worker.ts uses, built the
# way the Docker server builds them (deploy/docker/api.py,
# handle_markdown_request), so worker.ts runs unchanged on both machines:
#
#   POST /md      {"url", "f": "fit"|"raw"}  ->  {"url", "filter", "markdown", "success": true}
#                 a failed read is HTTP 502 {"detail"}, like the image
#   GET  /health  {"status": "ok"}           (no token, like the image)
#
# `fit` is PruningContentFilterLXML, `raw` the whole DOM, both through the LXML
# scraping strategy. Only those two: worker.ts asks for nothing else, and bm25
# is measured as a trap in README.md.
#
# Bound to 127.0.0.1 and token-checked: a page fetcher open on the home network
# would hand out the one IP whose good standing this setup depends on. And, as
# the image does, it refuses any host that resolves to a private, loopback or
# link-local address, with the image's own words, so worker.ts's plainError
# translates it the same way.
#
# Run (start-windows.ps1 does this):
#   set CRAWL4AI_TOKEN=...  &  set PLAYWRIGHT_BROWSERS_PATH=%USERPROFILE%\.local-fetch-worker\ms-playwright
#   %USERPROFILE%\.local-fetch-worker\venv\Scripts\python.exe crawl4ai_server.py
import asyncio
import ipaddress
import json
import os
import socket
import sys
from urllib.parse import urlsplit

from aiohttp import web
from crawl4ai import (AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig,
                      DefaultMarkdownGenerator, LXMLWebScrapingStrategy)
from crawl4ai.content_filter_strategy_lxml import PruningContentFilterLXML

HOST = '127.0.0.1'
PORT = int(os.environ.get('CRAWL4AI_PORT', '11235'))
TOKEN = os.environ.get('CRAWL4AI_TOKEN', '').strip()
# Pages read at once across every lane; each is a Chromium tab.
SLOTS = max(1, int(os.environ.get('CRAWL4AI_SLOTS', '4')))
# The image recycles its browser after this many pages: state builds up in one
# context and navigation slows (its config.yml, max_pages_before_recycle).
RECYCLE_AFTER = 200
PAGE_TIMEOUT_MS = 40_000

BLOCKED = 'URL blocked (SSRF protection)'


def public_host(url: str) -> None:
    """Raise unless every address the host resolves to is public."""
    host = urlsplit(url).hostname
    if not host:
        raise ValueError(BLOCKED + ': no host')
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        # The image says the same for a host with no DNS record.
        raise ValueError(BLOCKED + ': ' + host)
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split('%')[0])
        if not ip.is_global:
            raise ValueError(BLOCKED + ': ' + host)


class Reader:
    """One warm Chromium, shared by every request, replaced every RECYCLE_AFTER pages."""

    def __init__(self) -> None:
        self.crawler = None
        self.served = 0
        self.slots = asyncio.Semaphore(SLOTS)
        self.lock = asyncio.Lock()
        self.busy = 0

    async def browser(self) -> AsyncWebCrawler:
        async with self.lock:
            if self.crawler and self.served >= RECYCLE_AFTER and self.busy == 0:
                await self.crawler.close()
                self.crawler, self.served = None, 0
            if not self.crawler:
                self.crawler = AsyncWebCrawler(config=BrowserConfig(
                    headless=True, text_mode=True, verbose=False,
                    extra_args=['--disable-gpu', '--disable-dev-shm-usage', '--disable-software-rasterizer']))
                await self.crawler.start()
            return self.crawler

    async def markdown(self, url: str, f: str) -> str:
        async with self.slots:
            crawler = await self.browser()
            self.busy += 1
            try:
                generator = DefaultMarkdownGenerator() if f == 'raw' else DefaultMarkdownGenerator(content_filter=PruningContentFilterLXML())
                result = await crawler.arun(url=url, config=CrawlerRunConfig(
                    markdown_generator=generator, scraping_strategy=LXMLWebScrapingStrategy(),
                    cache_mode=CacheMode.BYPASS, page_timeout=PAGE_TIMEOUT_MS, verbose=False))
            finally:
                self.busy -= 1
                self.served += 1
            if not result.success:
                raise web.HTTPBadGateway(text=json_detail(result.error_message or 'the page could not be read'),
                                         content_type='application/json')
            return result.markdown.raw_markdown if f == 'raw' else result.markdown.fit_markdown


def json_detail(detail: str) -> str:
    return json.dumps({'detail': detail})


reader = Reader()


async def md(request: web.Request) -> web.Response:
    if TOKEN and request.headers.get('authorization', '') != 'Bearer ' + TOKEN:
        return web.json_response({'detail': 'bad or missing token'}, status=401)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({'detail': 'the body is not JSON'}, status=400)
    url = str(body.get('url') or '').strip()
    f = str(body.get('f') or 'fit')
    if not url.startswith(('http://', 'https://')):
        return web.json_response({'detail': 'Invalid URL format. Must start with http:// or https://'}, status=400)
    if f not in ('fit', 'raw'):
        return web.json_response({'detail': 'only f=fit and f=raw are served here'}, status=400)
    try:
        await asyncio.get_running_loop().run_in_executor(None, public_host, url)
        text = await reader.markdown(url, f)
    except web.HTTPException:
        raise
    except Exception as err:
        return web.json_response({'detail': str(err)[:500]}, status=500)
    return web.json_response({'url': url, 'filter': f, 'markdown': text, 'success': True})


async def health(_request: web.Request) -> web.Response:
    return web.json_response({'status': 'ok'})


def main() -> None:
    if not TOKEN:
        print('CRAWL4AI_TOKEN is not set; refusing to serve an open page fetcher', file=sys.stderr)
        sys.exit(2)
    app = web.Application(client_max_size=1 << 20)
    app.router.add_post('/md', md)
    app.router.add_get('/health', health)
    print(f'crawl4ai on {HOST}:{PORT}, {SLOTS} pages at once', flush=True)
    web.run_app(app, host=HOST, port=PORT, print=None)


if __name__ == '__main__':
    main()
