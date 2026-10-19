'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/appStore';
import { trackClientEvent } from '@/lib/analytics/trackClient';

const fields = [
  ['name', 'Name', 'नाम', 'text', 120, true, 'name'],
  ['company', 'Company / business', 'कंपनी / व्यवसाय', 'text', 160, true, 'organization'],
  ['email', 'Work email', 'ईमेल', 'email', 180, true, 'email'],
  ['phone', 'Phone (optional)', 'फोन (वैकल्पिक)', 'tel', 20, false, 'tel'],
  ['targetLocations', 'Target cities / regions', 'लक्षित शहर / क्षेत्र', 'text', 300, false, 'off'],
  ['budget', 'Budget range (optional)', 'बजट सीमा (वैकल्पिक)', 'text', 80, false, 'off'],
  ['timeline', 'Preferred dates / duration', 'पसंदीदा तारीख / अवधि', 'text', 120, false, 'off'],
] as const;
const campaignTypes = [
  ['display', 'Display ads', 'डिस्प्ले विज्ञापन'],
  ['sponsored', 'Sponsored story', 'प्रायोजित लेख'],
  ['video', 'Video campaign', 'वीडियो अभियान'],
  ['mixed', 'Help me choose', 'चुनने में मदद करें'],
] as const;
const controlClass = 'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white';

export default function AdvertiseInquiryForm() {
  const hi = useAppStore((state) => state.language) === 'hi';
  const sending = useRef(false);
  const started = useRef(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  function measure(event: string, campaignType?: string) {
    trackClientEvent({ event, source: 'advertise_page', metadata: campaignType ? { campaignType } : {} });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());
    const campaignType = String(payload.campaignType);
    sending.current = true;
    setStatus('sending');
    try {
      const response = await fetch('/api/advertise/inquiry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, consent: data.get('consent') === 'on', source: 'main-advertise' }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('Submission failed');
      setStatus('success');
      measure('advertise_inquiry_success', campaignType);
      form.reset();
    } catch {
      setStatus('error');
      measure('advertise_inquiry_error', campaignType);
    } finally {
      sending.current = false;
    }
  }

  return <form id="campaign-enquiry" onSubmit={submit} onFocusCapture={() => {
    if (!started.current) { started.current = true; measure('advertise_inquiry_start'); }
  }} className="mt-5 space-y-4 text-sm">
    <p className="text-zinc-600 dark:text-zinc-400">{hi ? 'यह जानकारी माँगने का अनुरोध है। दरें, उपलब्धता और प्रस्ताव टीम की पुष्टि के बाद तय होंगे।' : 'This is a request for information. Rates, availability and proposals are subject to confirmation by our team.'}</p>
    <fieldset disabled={status === 'sending'} className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">{hi ? 'अभियान की जानकारी' : 'Campaign details'}</legend>
      {fields.map(([name, en, hindi, type, maxLength, required, autoComplete]) => <label key={name} htmlFor={`advertise-${name}`} className="block font-medium text-zinc-800 dark:text-zinc-200">
        {hi ? hindi : en}{required ? ' *' : ''}
        <input id={`advertise-${name}`} name={name} type={type} maxLength={maxLength} minLength={required ? 2 : undefined} required={required} autoComplete={autoComplete} className={controlClass} />
      </label>)}
      <label htmlFor="advertise-campaignType" className="block font-medium text-zinc-800 dark:text-zinc-200">
        {hi ? 'अभियान का प्रकार' : 'Campaign type'}
        <select id="advertise-campaignType" name="campaignType" defaultValue="display" className={controlClass}>
          {campaignTypes.map(([value, en, hindi]) => <option key={value} value={value}>{hi ? hindi : en}</option>)}
        </select>
      </label>
      <label htmlFor="advertise-message" className="block font-medium text-zinc-800 dark:text-zinc-200 sm:col-span-2">
        {hi ? 'अभियान का उद्देश्य और जानकारी *' : 'Campaign goals and details *'}
        <textarea id="advertise-message" name="message" required minLength={10} maxLength={5000} rows={4} className={controlClass} />
      </label>
      <div hidden aria-hidden="true"><label htmlFor="advertise-website">Website<input id="advertise-website" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-3 text-zinc-700 dark:text-zinc-300 sm:col-span-2">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-red-600" />
        <span>{hi ? 'मैं इस अनुरोध के बारे में संपर्क किए जाने से सहमत हूँ।' : 'I agree to be contacted about this request.'} <Link className="underline" href="/main/privacy">{hi ? 'गोपनीयता नीति' : 'Privacy policy'}</Link></span>
      </label>
      <button type="submit" className="justify-self-start rounded-xl bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-60">{status === 'sending' ? (hi ? 'भेज रहे हैं…' : 'Sending…') : (hi ? 'पूछताछ भेजें' : 'Send enquiry')}</button>
    </fieldset>
    {status === 'success' && <p role="status" className="rounded-lg border border-green-600 p-3 text-green-800 dark:text-green-300">{hi ? 'आपकी पूछताछ मिल गई है। हमारी टीम दिए गए संपर्क पर आपसे बात करेगी।' : 'Your enquiry has been received. Our team will contact you using the details provided.'}</p>}
    {status === 'error' && <p role="alert" className="rounded-lg border border-red-500 p-3 text-red-700 dark:text-red-300">{hi ? 'पूछताछ नहीं भेजी जा सकी। जानकारी जाँचकर दोबारा कोशिश करें या नीचे दिए ईमेल पर संपर्क करें।' : 'Your enquiry could not be sent. Check the details and try again, or use the email below.'}</p>}
  </form>;
}
