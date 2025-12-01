/**
 * API Route: Tavily Web Search
 * 
 * Performs web searches using Tavily API and returns structured results
 * for the voice assistant to speak.
 */

import { NextRequest, NextResponse } from 'next/server'
import { tavily } from '@tavily/core'

const client = tavily({ apiKey: process.env.TAVILY_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, searchDepth = 'basic', maxResults = 5 } = body

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        { error: 'TAVILY_API_KEY not configured' },
        { status: 500 }
      )
    }

    console.log('🔍 Tavily search:', query)

    const response = await client.search(query, {
      searchDepth: searchDepth as 'basic' | 'advanced',
      maxResults,
      includeAnswer: true,
      includeRawContent: false,
    })

    // Format results for voice output
    const formattedResults = {
      answer: response.answer || null,
      results: response.results.map((r) => ({
        title: r.title,
        content: r.content,
        url: r.url,
      })),
      query: response.query,
    }

    console.log('✅ Tavily search complete:', formattedResults.results.length, 'results')

    return NextResponse.json(formattedResults)
  } catch (error: any) {
    console.error('❌ Tavily search error:', error)
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    )
  }
}
