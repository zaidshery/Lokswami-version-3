import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/register/route';

describe('POST /api/auth/register', () => {
  it('rejects registration without full name', async () => {
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: '',
        email: 'test@example.com',
        password: 'password123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/full name/i);
  });

  it('rejects registration with short password', async () => {
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Rahul Sharma',
        email: 'rahul@example.com',
        password: '123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/at least 6 characters/i);
  });

  it('successfully registers with valid WhatsApp number', async () => {
    const phone = `98${String(Date.now()).slice(-8)}`;
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Test Subscriber',
        whatsappNumber: phone,
        password: 'securePassword123',
        optInDailyEpaper: true,
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.user.name).toBe('Test Subscriber');
    expect(json.user.whatsappNumber).toBe(`+91${phone}`);
  });
});
