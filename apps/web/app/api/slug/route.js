import { NextResponse } from 'next/server';
import { makeSlug } from '../../../lib/core.js';

const RESERVED = ['admin', 'assets', 'api', 'sites'];

export async function POST(request) {
  try {
    const body = await request.json();
    const { names, usedSlugs } = body || {};

    if (!names || !Array.isArray(names)) {
      return NextResponse.json(
        { message: 'names array is required' },
        { status: 400 }
      );
    }

    // Try to generate a slug, retrying on collision
    let slug;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;

    do {
      slug = makeSlug(names);
      attempts += 1;

      // Check against reserved prefixes
      const prefixCheck = RESERVED.some(r => slug.startsWith(r + '-'));
      if (prefixCheck) {
        // Fallback to wedding-random
        slug = 'wedding-' + (await randomBase32(6));
      }

      // If we have usedSlugs, check for collision
      if (usedSlugs && usedSlugs.includes(slug)) {
        // Collision - retry
        continue;
      }

      // Validate format against SQL constraint
      const formatRegex = '^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$';
      const validFormat = new RegExp(formatRegex).test(slug);

      if (!validFormat) {
        // Invalid format - regenerate
        continue;
      }

      // Valid slug found
      break;

    } while (attempts < MAX_ATTEMPTS);

    return NextResponse.json({
      slug,
      success: attempts < MAX_ATTEMPTS,
      attempts,
      message: attempts >= MAX_ATTEMPTS
        ? 'Could not generate unique slug after maximum attempts'
        : 'Slug generated successfully',
    });
  } catch (error) {
    console.error('Slug generation error:', error);
    return NextResponse.json(
      { message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}

// Helper: generate random base32 slug segment
async function randomBase32(n) {
  // Simple pseudo-random for server side
  const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  for (let i = 0; i < n; i++) {
    // Use crypto for real randomness
    const byte = await randomByte();
    result += text[byte % text.length];
  }
  return result;
}

async function randomByte() {
  // Use Math.random as fallback; in production use crypto.getRandomValues
  return Math.floor(Math.random() * 256);
}