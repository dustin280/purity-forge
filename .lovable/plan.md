The errors shown are a real configuration/code mismatch, not a problem with your question or the AI itself. Your Firecrawl connector is linked as a direct API connection, but the app code is currently trying to call it through the connector gateway, which returns `Credential not found`.

Plan:
1. Update the shared Firecrawl helper used by both the Column Advisor and Troubleshooting agents so it calls Firecrawl’s direct API with `FIRECRAWL_API_KEY` instead of the connector gateway.
2. Keep the existing timeout/error handling so if Firecrawl is slow, out of credits, or rate-limited, the AI agent can continue and show a useful message.
3. Verify the helper supports both operations the agents use: web search and page scrape.
4. Test the affected paths enough to confirm the old `connectors_gateway / Credential not found` error is gone.

Expected result: the agents will still use your uploaded knowledge base first, then Firecrawl web search when needed, without repeatedly showing that credential error.