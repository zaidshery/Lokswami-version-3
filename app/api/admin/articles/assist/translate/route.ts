import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

type TranslationField = 'title' | 'summary' | 'content';
type TranslationLanguage = 'hi' | 'en';

const MAX_SOURCE_LENGTH = 60_000;
const MAX_CONTEXT_LENGTH = 30_000;

function text(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function parseRequestBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be an object');
  }

  const source = body as Record<string, unknown>;
  const field = source.field;
  const targetLanguage = source.targetLanguage;
  if (field !== 'title' && field !== 'summary' && field !== 'content') {
    throw new Error('Choose a valid article field');
  }
  if (targetLanguage !== 'hi' && targetLanguage !== 'en') {
    throw new Error('Choose Hindi or English');
  }

  const sourceText = text(source.sourceText, MAX_SOURCE_LENGTH);
  if (!sourceText) throw new Error('There is no text to translate');

  return {
    field: field as TranslationField,
    targetLanguage: targetLanguage as TranslationLanguage,
    sourceText,
    articleBody: text(source.articleBody, MAX_CONTEXT_LENGTH),
    reporterNotes: text(source.reporterNotes, MAX_CONTEXT_LENGTH),
    sourcePackage: text(source.sourcePackage, MAX_CONTEXT_LENGTH),
  };
}

function extractTranslation(payload: unknown) {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const first = candidates[0] && typeof candidates[0] === 'object'
    ? candidates[0] as Record<string, unknown>
    : {};
  const content = first.content && typeof first.content === 'object'
    ? first.content as Record<string, unknown>
    : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const responseText = parts
    .map((part) => part && typeof part === 'object' ? String((part as Record<string, unknown>).text || '') : '')
    .join('')
    .trim();
  if (!responseText) return '';

  try {
    const parsed = JSON.parse(responseText) as { translation?: unknown };
    return typeof parsed.translation === 'string' ? parsed.translation.trim() : '';
  } catch {
    return '';
  }
}

async function POSTHandler(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canViewPage(user.role, 'articles')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const input = parseRequestBody(await req.json().catch(() => null));
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Translation assistant is not configured' },
        { status: 503 }
      );
    }

    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const languageName = input.targetLanguage === 'hi' ? 'Hindi' : 'English';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: [
                'You are a newsroom translation assistant.',
                'Translate faithfully and do not add, remove, infer, or correct names, numbers, quotes, dates, claims, or facts.',
                'Use the approved context only to resolve pronouns or terminology already present in the source text.',
                'Preserve HTML structure, links, shortcodes, and attribution exactly when they appear.',
                'Return JSON only, with one string property named translation.',
              ].join(' '),
            }],
          },
          contents: [{
            role: 'user',
            parts: [{
              text: [
                `Translate the ${input.field} into ${languageName}.`,
                '',
                'TEXT TO TRANSLATE:',
                input.sourceText,
                '',
                'APPROVED ARTICLE BODY CONTEXT:',
                input.articleBody || '(none)',
                '',
                'APPROVED REPORTER NOTES:',
                input.reporterNotes || '(none)',
                '',
                'APPROVED SOURCE PACKAGE:',
                input.sourcePackage || '(none)',
              ].join('\n'),
            }],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: { translation: { type: 'STRING' } },
              required: ['translation'],
            },
          },
        }),
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Translation provider is temporarily unavailable' },
        { status: 502 }
      );
    }

    const translation = extractTranslation(payload);
    if (!translation) {
      return NextResponse.json(
        { success: false, error: 'Translation provider returned an invalid response' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        field: input.field,
        targetLanguage: input.targetLanguage,
        sourceText: input.sourceText,
        translation,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Translation failed';
    const isInputError = [
      'Request body',
      'Choose a valid',
      'Choose Hindi',
      'There is no text',
    ].some((prefix) => message.includes(prefix));
    return NextResponse.json(
      { success: false, error: message },
      { status: isInputError ? 400 : 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
