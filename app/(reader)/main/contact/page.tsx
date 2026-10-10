'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
} from 'lucide-react';
import TurnstileWidget from '@/components/forms/TurnstileWidget';
import { trackClientEvent } from '@/lib/analytics/trackClient';
import { useAppStore } from '@/lib/store/appStore';
import { COMPANY_INFO } from '@/lib/constants/company';

type ContactFormValues = {
  name: string;
  email: string;
  phone: string;
  inquiryType: string;
  preferredContact: string;
  subject: string;
  message: string;
  consent: boolean;
  website: string;
};

type ContactFormErrors = Partial<
  Record<
    'name' | 'email' | 'phone' | 'inquiryType' | 'message' | 'consent' | 'captcha',
    string
  >
>;

type SubmitState = 'idle' | 'success' | 'error';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+()\-\s0-9]{7,20}$/;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

const INITIAL_FORM: ContactFormValues = {
  name: '',
  email: '',
  phone: '',
  inquiryType: 'general',
  preferredContact: 'email',
  subject: '',
  message: '',
  consent: false,
  website: '',
};

const COPY = {
  en: {
    pageTitle: 'Contact Us',
    pageSubtitle:
      'Share a news tip, advertise query, partnership request, or product feedback. Our team usually replies within one business day.',
    trustLine: 'Secure form. No spam. Human response.',
    formTitle: 'Send a Message',
    formSubtitle: 'Give us the right context so we can route your request faster.',
    inquiryTypeLabel: 'Inquiry Type',
    preferredContactLabel: 'Preferred Contact Method',
    nameLabel: 'Full Name',
    emailLabel: 'Email Address',
    phoneLabel: 'Phone Number (Optional)',
    subjectLabel: 'Subject (Optional)',
    messageLabel: 'Message',
    messageHint: 'Add links, article URLs, or city details if relevant.',
    captchaLabel: 'Security Check',
    captchaHint: 'Please confirm you are not a bot.',
    consentLabel: 'I agree to be contacted regarding this request.',
    submitLabel: 'Send Message',
    submittingLabel: 'Sending...',
    successFallback: 'Thanks. Your message has been submitted successfully.',
    errorFallback: 'Unable to send your message. Please try again.',
    nameError: 'Please enter your name (minimum 2 characters).',
    emailError: 'Please enter a valid email address.',
    phoneError: 'Please enter a valid phone number.',
    inquiryTypeError: 'Please choose an inquiry type.',
    messageError: 'Please enter a message (minimum 10 characters).',
    captchaError: 'Please complete the anti-bot verification.',
    consentError: 'Please confirm consent before submitting.',
    contactCardTitle: 'Contact Details',
    officeLabel: 'Office Address',
    officeHoursLabel: 'Office Hours',
    officeHoursValue: 'Mon-Sat, 10:00 AM to 7:00 PM (IST)',
    phoneCardLabel: 'Phone',
    emailCardLabel: 'Email',
    responseTimeLabel: 'Expected Response Time',
    responseTimeValue: 'Within 24 business hours',
    openMapLabel: 'Open in Google Maps',
    quickActionsTitle: 'Quick Actions',
    callNowLabel: 'Call Now',
    emailNowLabel: 'Email Now',
    whatsappLabel: 'WhatsApp Channel',
    faqTitle: 'Before You Submit',
    faqItems: [
      {
        q: 'How quickly will I get a response?',
        a: 'Most requests are answered within one business day.',
      },
      {
        q: 'Where should I send a breaking news tip?',
        a: 'Choose "News Tip" and include city, time, and source links.',
      },
      {
        q: 'Can I request advertising rates?',
        a: 'Yes. Select "Advertising" and share target city and campaign objective.',
      },
    ],
    source: 'main-contact',
    inquiryOptions: [
      { value: 'general', label: 'General Inquiry' },
      { value: 'news-tip', label: 'News Tip' },
      { value: 'advertising', label: 'Advertising' },
      { value: 'partnership', label: 'Partnership' },
      { value: 'support', label: 'Technical Support' },
    ],
    preferredContactOptions: [
      { value: 'email', label: 'Email' },
      { value: 'phone', label: 'Phone' },
      { value: 'whatsapp', label: 'WhatsApp' },
    ],
  },
  hi: {
    pageTitle: '\u0938\u0902\u092a\u0930\u094d\u0915 \u0915\u0930\u0947\u0902',
    pageSubtitle:
      '\u0916\u092c\u0930 \u091f\u093f\u092a, \u0935\u093f\u091c\u094d\u091e\u093e\u092a\u0928, \u092a\u093e\u0930\u094d\u091f\u0928\u0930\u0936\u093f\u092a \u092f\u093e \u0938\u0939\u093e\u092f\u0924\u093e \u0938\u0902\u092c\u0902\u0927\u0940 \u092e\u0947\u0938\u0947\u091c \u092d\u0947\u091c\u0947\u0902\u0964 \u0939\u092e \u0906\u092e\u0924\u094c\u0930 \u092a\u0930 \u090f\u0915 \u0915\u093e\u0930\u094d\u092f\u0926\u093f\u0935\u0938 \u092e\u0947\u0902 \u091c\u0935\u093e\u092c \u0926\u0947\u0924\u0947 \u0939\u0948\u0902\u0964',
    trustLine: '\u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u092b\u0949\u0930\u094d\u092e\u0964 \u0938\u094d\u092a\u0948\u092e \u0928\u0939\u0940\u0902\u0964 \u0915\u0947\u0935\u0932 \u0935\u093e\u0938\u094d\u0924\u0935\u093f\u0915 \u091f\u0940\u092e \u0915\u093e \u091c\u0935\u093e\u092c\u0964',
    formTitle: '\u0938\u0902\u0926\u0947\u0936 \u092d\u0947\u091c\u0947\u0902',
    formSubtitle: '\u0938\u0939\u0940 \u0935\u093f\u0935\u0930\u0923 \u0926\u0947\u0902 \u0924\u093e\u0915\u093f \u0906\u092a\u0915\u093e \u0930\u093f\u0915\u094d\u0935\u0947\u0938\u094d\u091f \u091c\u0932\u094d\u0926\u0940 \u0938\u0939\u0940 \u091f\u0940\u092e \u0924\u0915 \u091c\u093e \u0938\u0915\u0947\u0964',
    inquiryTypeLabel: '\u0905\u0928\u0941\u0930\u094b\u0927 \u0915\u093e \u092a\u094d\u0930\u0915\u093e\u0930',
    preferredContactLabel: '\u092a\u0938\u0902\u0926\u0940\u0926\u093e \u0938\u0902\u092a\u0930\u094d\u0915 \u092e\u093e\u0927\u094d\u092f\u092e',
    nameLabel: '\u092a\u0942\u0930\u093e \u0928\u093e\u092e',
    emailLabel: '\u0908\u092e\u0947\u0932 \u092a\u0924\u093e',
    phoneLabel: '\u092b\u094b\u0928 \u0928\u0902\u092c\u0930 (\u0910\u091a\u094d\u091b\u093f\u0915)',
    subjectLabel: '\u0935\u093f\u0937\u092f (\u0910\u091a\u094d\u091b\u093f\u0915)',
    messageLabel: '\u0938\u0902\u0926\u0947\u0936',
    messageHint: '\u092f\u0926\u093f \u0932\u093e\u0917\u0942 \u0939\u094b, \u0938\u094b\u0930\u094d\u0938 \u0932\u093f\u0902\u0915, \u0906\u0930\u094d\u091f\u093f\u0915\u0932 URL \u092f\u093e \u0938\u093f\u091f\u0940 \u0921\u093f\u091f\u0947\u0932 \u091c\u093c\u0930\u0942\u0930 \u0932\u093f\u0916\u0947\u0902\u0964',
    captchaLabel: '\u0938\u0941\u0930\u0915\u094d\u0937\u093e \u091c\u093e\u0902\u091a',
    captchaHint: '\u0915\u0943\u092a\u092f\u093e \u092c\u094b\u091f \u0928 \u0939\u094b\u0928\u0947 \u0915\u0940 \u092a\u0941\u0937\u094d\u091f\u093f \u0915\u0930\u0947\u0902\u0964',
    consentLabel: '\u092e\u0948\u0902 \u0907\u0938 \u0905\u0928\u0941\u0930\u094b\u0927 \u0915\u0947 \u0938\u0902\u092c\u0902\u0927 \u092e\u0947\u0902 \u0938\u0902\u092a\u0930\u094d\u0915 \u0915\u093f\u090f \u091c\u093e\u0928\u0947 \u0938\u0947 \u0938\u0939\u092e\u0924 \u0939\u0942\u0902\u0964',
    submitLabel: '\u0938\u0902\u0926\u0947\u0936 \u092d\u0947\u091c\u0947\u0902',
    submittingLabel: '\u092d\u0947\u091c\u093e \u091c\u093e \u0930\u0939\u093e \u0939\u0948...',
    successFallback: '\u0927\u0928\u094d\u092f\u0935\u093e\u0926\u0964 \u0906\u092a\u0915\u093e \u0938\u0902\u0926\u0947\u0936 \u0938\u092b\u0932\u0924\u093e\u092a\u0942\u0930\u094d\u0935\u0915 \u092d\u0947\u091c\u093e \u0917\u092f\u093e \u0939\u0948\u0964',
    errorFallback: '\u0905\u092d\u0940 \u0938\u0902\u0926\u0947\u0936 \u0928\u0939\u0940\u0902 \u092d\u0947\u091c\u093e \u091c\u093e \u0938\u0915\u093e\u0964 \u0915\u0943\u092a\u092f\u093e \u0926\u094b\u092c\u093e\u0930\u093e \u0915\u094b\u0936\u093f\u0936 \u0915\u0930\u0947\u0902\u0964',
    nameError: '\u0915\u0943\u092a\u092f\u093e \u0935\u0948\u0927 \u0928\u093e\u092e \u0926\u0930\u094d\u091c \u0915\u0930\u0947\u0902 (\u0915\u092e \u0938\u0947 \u0915\u092e 2 \u0905\u0915\u094d\u0937\u0930)\u0964',
    emailError: '\u0915\u0943\u092a\u092f\u093e \u0935\u0948\u0927 \u0908\u092e\u0947\u0932 \u092a\u0924\u093e \u0926\u0930\u094d\u091c \u0915\u0930\u0947\u0902\u0964',
    phoneError: '\u0915\u0943\u092a\u092f\u093e \u0935\u0948\u0927 \u092b\u094b\u0928 \u0928\u0902\u092c\u0930 \u0926\u0930\u094d\u091c \u0915\u0930\u0947\u0902\u0964',
    inquiryTypeError: '\u0915\u0943\u092a\u092f\u093e \u0905\u0928\u0941\u0930\u094b\u0927 \u0915\u093e \u092a\u094d\u0930\u0915\u093e\u0930 \u091a\u0941\u0928\u0947\u0902\u0964',
    messageError: '\u0915\u0943\u092a\u092f\u093e \u0938\u0902\u0926\u0947\u0936 \u0926\u0930\u094d\u091c \u0915\u0930\u0947\u0902 (\u0915\u092e \u0938\u0947 \u0915\u092e 10 \u0905\u0915\u094d\u0937\u0930)\u0964',
    captchaError: '\u0915\u0943\u092a\u092f\u093e \u090f\u0902\u091f\u0940-\u092c\u094b\u091f \u0935\u0947\u0930\u093f\u092b\u093f\u0915\u0947\u0936\u0928 \u092a\u0942\u0930\u093e \u0915\u0930\u0947\u0902\u0964',
    consentError: '\u0938\u092c\u092e\u093f\u091f \u0938\u0947 \u092a\u0939\u0932\u0947 \u0938\u0939\u092e\u0924\u093f \u0915\u0940 \u092a\u0941\u0937\u094d\u091f\u093f \u0915\u0930\u0947\u0902\u0964',
    contactCardTitle: '\u0938\u0902\u092a\u0930\u094d\u0915 \u0935\u093f\u0935\u0930\u0923',
    officeLabel: '\u0911\u092b\u093f\u0938 \u092a\u0924\u093e',
    officeHoursLabel: '\u0915\u093e\u0930\u094d\u092f\u093e\u0932\u092f \u0938\u092e\u092f',
    officeHoursValue: '\u0938\u094b\u092e-\u0936\u0928\u093f, \u0938\u0941\u092c\u0939 10:00 \u0938\u0947 \u0936\u093e\u092e 7:00 (\u092d\u093e\u0930\u0924\u0940\u092f \u0938\u092e\u092f)',
    phoneCardLabel: '\u092b\u094b\u0928',
    emailCardLabel: '\u0908\u092e\u0947\u0932',
    responseTimeLabel: '\u0905\u0928\u0941\u092e\u093e\u0928\u093f\u0924 \u091c\u0935\u093e\u092c \u0938\u092e\u092f',
    responseTimeValue: '24 \u0915\u093e\u0930\u094d\u092f \u0918\u0902\u091f\u0947 \u0915\u0947 \u0905\u0902\u0926\u0930',
    openMapLabel: 'Google Maps \u092e\u0947\u0902 \u0916\u094b\u0932\u0947\u0902',
    quickActionsTitle: '\u0924\u0941\u0930\u0902\u0924 \u0938\u0902\u092a\u0930\u094d\u0915',
    callNowLabel: '\u0905\u092d\u0940 \u0915\u0949\u0932 \u0915\u0930\u0947\u0902',
    emailNowLabel: '\u0908\u092e\u0947\u0932 \u092d\u0947\u091c\u0947\u0902',
    whatsappLabel: 'WhatsApp \u091a\u0948\u0928\u0932',
    faqTitle: '\u0938\u092c\u092e\u093f\u091f \u0938\u0947 \u092a\u0939\u0932\u0947',
    faqItems: [
      {
        q: '\u091c\u0935\u093e\u092c \u0915\u093f\u0924\u0928\u0940 \u091c\u0932\u094d\u0926\u0940 \u092e\u093f\u0932\u0947\u0917\u093e?',
        a: '\u0905\u0927\u093f\u0915\u0924\u0930 \u0930\u093f\u0915\u094d\u0935\u0947\u0938\u094d\u091f \u0915\u093e \u091c\u0935\u093e\u092c \u090f\u0915 \u0915\u093e\u0930\u094d\u092f\u0926\u093f\u0935\u0938 \u092e\u0947\u0902 \u092e\u093f\u0932 \u091c\u093e\u0924\u093e \u0939\u0948\u0964',
      },
      {
        q: '\u092c\u094d\u0930\u0947\u0915\u093f\u0902\u0917 \u0928\u094d\u092f\u0942\u091c \u091f\u093f\u092a \u0915\u0939\u093e\u0901 \u092d\u0947\u091c\u0942\u0901?',
        a: '"News Tip" \u091a\u0941\u0928\u0947\u0902 \u0914\u0930 \u0938\u093f\u091f\u0940, \u0938\u092e\u092f \u0935 \u0938\u094b\u0930\u094d\u0938 \u0932\u093f\u0902\u0915 \u091c\u0930\u0942\u0930 \u0926\u0947\u0902\u0964',
      },
      {
        q: '\u0915\u094d\u092f\u093e \u0935\u093f\u091c\u094d\u091e\u093e\u092a\u0928 \u0930\u0947\u091f \u092e\u093e\u0902\u0917 \u0938\u0915\u0924\u0947 \u0939\u0948\u0902?',
        a: '\u0939\u093e\u0901\u0964 "Advertising" \u091a\u0941\u0928\u0915\u0930 \u0936\u0939\u0930 \u0914\u0930 \u0915\u0948\u092e\u094d\u092a\u0947\u0928 \u0932\u0915\u094d\u0937\u094d\u092f \u0936\u0947\u092f\u0930 \u0915\u0930\u0947\u0902\u0964',
      },
    ],
    source: 'main-contact',
    inquiryOptions: [
      { value: 'general', label: '\u0938\u093e\u092e\u093e\u0928\u094d\u092f \u091c\u093e\u0928\u0915\u093e\u0930\u0940' },
      { value: 'news-tip', label: '\u0928\u094d\u092f\u0942\u091c \u091f\u093f\u092a' },
      { value: 'advertising', label: '\u0935\u093f\u091c\u094d\u091e\u093e\u092a\u0928' },
      { value: 'partnership', label: '\u092a\u093e\u0930\u094d\u091f\u0928\u0930\u0936\u093f\u092a' },
      { value: 'support', label: '\u091f\u0947\u0915\u094d\u0928\u093f\u0915\u0932 \u0938\u0939\u093e\u092f\u0924\u093e' },
    ],
    preferredContactOptions: [
      { value: 'email', label: '\u0908\u092e\u0947\u0932' },
      { value: 'phone', label: '\u092b\u094b\u0928' },
      { value: 'whatsapp', label: 'WhatsApp' },
    ],
  },
};

export default function ContactPage() {
  const { language } = useAppStore();
  const t = COPY[language];

  const [form, setForm] = useState<ContactFormValues>(INITIAL_FORM);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileRenderKey, setTurnstileRenderKey] = useState(0);
  const [hasTrackedStart, setHasTrackedStart] = useState(false);

  const contactAddress = useMemo(
    () => COMPANY_INFO.address.displayAddress,
    []
  );
  const mapsUrl = useMemo(
    () => COMPANY_INFO.address.mapUrl,
    []
  );


  const structuredData = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'NewsMediaOrganization',
      name: COMPANY_INFO.name,
      url: 'https://lokswami.com',
      contactPoint: [
        {
          '@type': 'ContactPoint',
          telephone: COMPANY_INFO.contact.phone,
          contactType: 'customer support',
          email: COMPANY_INFO.contact.email,
          availableLanguage: ['en', 'hi'],
        },
      ],
      address: {
        '@type': 'PostalAddress',
        streetAddress: `${COMPANY_INFO.address.street}, ${COMPANY_INFO.address.road}`,
        addressLocality: COMPANY_INFO.address.city,
        addressRegion: COMPANY_INFO.address.state,
        addressCountry: COMPANY_INFO.address.country,
      },
    }),
    []
  );

  const inputClassName =
    'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-red-400 dark:focus:ring-red-500/20';

  const messageLength = form.message.trim().length;
  const selectedInquiryLabel =
    t.inquiryOptions.find((option) => option.value === form.inquiryType)?.label ||
    t.inquiryOptions[0]?.label ||
    'General';

  function updateField<K extends keyof ContactFormValues>(
    key: K,
    value: ContactFormValues[K]
  ) {
    if (!hasTrackedStart) {
      setHasTrackedStart(true);
      trackClientEvent({
        event: 'contact_form_start',
        page: '/main/contact',
        source: 'contact_form',
      });
    }
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof ContactFormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function validateForm(): boolean {
    const nextErrors: ContactFormErrors = {};

    if (form.name.trim().length < 2) {
      nextErrors.name = t.nameError;
    }

    if (!EMAIL_REGEX.test(form.email.trim())) {
      nextErrors.email = t.emailError;
    }

    if (form.phone.trim() && !PHONE_REGEX.test(form.phone.trim())) {
      nextErrors.phone = t.phoneError;
    }

    if (!form.inquiryType.trim()) {
      nextErrors.inquiryType = t.inquiryTypeError;
    }

    if (form.message.trim().length < 10) {
      nextErrors.message = t.messageError;
    }

    if (!form.consent) {
      nextErrors.consent = t.consentError;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      nextErrors.captcha = t.captchaError;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      trackClientEvent({
        event: 'contact_validation_fail',
        page: '/main/contact',
        source: 'contact_form',
        metadata: { fields: Object.keys(nextErrors) },
      });
    }
    return Object.keys(nextErrors).length === 0;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitState('idle');
    setSubmitMessage('');

    const subjectPrefix = `[${selectedInquiryLabel}]`;
    const normalizedSubject = form.subject.trim();
    const finalSubject = normalizedSubject
      ? `${subjectPrefix} ${normalizedSubject}`
      : subjectPrefix;
    const preferredContactLabel =
      t.preferredContactOptions.find(
        (option) => option.value === form.preferredContact
      )?.label || form.preferredContact;
    const messageWithMeta = `[Preferred Contact: ${preferredContactLabel}]\n${form.message}`;

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          subject: finalSubject,
          message: messageWithMeta,
          source: `${t.source}-${form.inquiryType}`,
          website: form.website,
          turnstileToken,
        }),
      });

      const data = await response
        .json()
        .catch(
          () =>
            ({} as {
              success?: boolean;
              message?: string;
              error?: string;
              ticketId?: string;
            })
        );

      if (!response.ok || !data.success) {
        setSubmitState('error');
        setSubmitMessage(data.error || t.errorFallback);
        trackClientEvent({
          event: 'contact_submit_fail',
          page: '/main/contact',
          source: 'contact_form',
          metadata: {
            status: response.status,
            reason: String(data.error || ''),
          },
        });
        return;
      }

      setForm(INITIAL_FORM);
      setErrors({});
      setTurnstileToken('');
      setTurnstileRenderKey((prev) => prev + 1);
      setHasTrackedStart(false);
      setSubmitState('success');
      const ticketId =
        typeof data.ticketId === 'string' ? data.ticketId.trim() : '';
      setSubmitMessage(
        ticketId
          ? `${data.message || t.successFallback} Ticket ID: ${ticketId}`
          : data.message || t.successFallback
      );
      trackClientEvent({
        event: 'contact_submit_success',
        page: '/main/contact',
        source: 'contact_form',
        metadata: { ticketId: ticketId || undefined },
      });
    } catch {
      setSubmitState('error');
      setSubmitMessage(t.errorFallback);
      trackClientEvent({
        event: 'contact_submit_fail',
        page: '/main/contact',
        source: 'contact_form',
        metadata: { reason: 'network_error' },
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-4 sm:space-y-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="cnp-surface relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-red-500" />
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          {t.pageTitle}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
          {t.pageSubtitle}
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t.trustLine}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="cnp-surface p-5 sm:p-6 lg:col-span-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 sm:text-xl">
            {t.formTitle}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t.formSubtitle}</p>

          <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="contact-inquiry-type"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.inquiryTypeLabel}
                </label>
                <select
                  id="contact-inquiry-type"
                  value={form.inquiryType}
                  onChange={(event) => updateField('inquiryType', event.target.value)}
                  className={inputClassName}
                  required
                >
                  {t.inquiryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.inquiryType ? (
                  <p className="mt-1 text-xs text-red-500">{errors.inquiryType}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="contact-preferred-contact"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.preferredContactLabel}
                </label>
                <select
                  id="contact-preferred-contact"
                  value={form.preferredContact}
                  onChange={(event) =>
                    updateField('preferredContact', event.target.value)
                  }
                  className={inputClassName}
                >
                  {t.preferredContactOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="contact-name"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.nameLabel}
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  className={inputClassName}
                  autoComplete="name"
                  required
                />
                {errors.name ? <p className="mt-1 text-xs text-red-500">{errors.name}</p> : null}
              </div>

              <div>
                <label
                  htmlFor="contact-email"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.emailLabel}
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  className={inputClassName}
                  autoComplete="email"
                  required
                />
                {errors.email ? <p className="mt-1 text-xs text-red-500">{errors.email}</p> : null}
              </div>

              <div>
                <label
                  htmlFor="contact-phone"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.phoneLabel}
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  className={inputClassName}
                  autoComplete="tel"
                />
                {errors.phone ? <p className="mt-1 text-xs text-red-500">{errors.phone}</p> : null}
              </div>

              <div>
                <label
                  htmlFor="contact-subject"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.subjectLabel}
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  value={form.subject}
                  onChange={(event) => updateField('subject', event.target.value)}
                  className={inputClassName}
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="contact-message"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {t.messageLabel}
                </label>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {messageLength}/5000
                </span>
              </div>
              <textarea
                id="contact-message"
                value={form.message}
                onChange={(event) => updateField('message', event.target.value)}
                className={`${inputClassName} min-h-[160px] resize-y`}
                maxLength={5000}
                required
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t.messageHint}</p>
              {errors.message ? (
                <p className="mt-1 text-xs text-red-500">{errors.message}</p>
              ) : null}
            </div>

            <div>
              <label className="inline-flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(event) => updateField('consent', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
                />
                <span>{t.consentLabel}</span>
              </label>
              {errors.consent ? (
                <p className="mt-1 text-xs text-red-500">{errors.consent}</p>
              ) : null}
            </div>

            <div
              className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
              aria-hidden="true"
            >
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) => updateField('website', event.target.value)}
              />
            </div>

            {TURNSTILE_SITE_KEY ? (
              <div>
                <p className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t.captchaLabel}
                </p>
                <div className="rounded-xl border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                  <TurnstileWidget
                    key={turnstileRenderKey}
                    siteKey={TURNSTILE_SITE_KEY}
                    onTokenChange={(token) => {
                      setTurnstileToken(token);
                      if (errors.captcha && token) {
                        setErrors((prev) => ({ ...prev, captcha: undefined }));
                      }
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t.captchaHint}</p>
                {errors.captcha ? (
                  <p className="mt-1 text-xs text-red-500">{errors.captcha}</p>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Send className="h-4 w-4" />
              {isSubmitting ? t.submittingLabel : t.submitLabel}
            </button>
          </form>

          {submitState !== 'idle' ? (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                submitState === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-300'
              }`}
            >
              {submitMessage}
            </div>
          ) : null}
        </div>

        <aside className="cnp-surface p-5 sm:p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 sm:text-xl">
            {t.contactCardTitle}
          </h2>

          <div className="mt-4 space-y-4 text-sm text-zinc-700 dark:text-zinc-300 sm:text-[15px]">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="font-semibold">{t.officeLabel}</p>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reader-touch-link reader-focus-ring mt-1 inline-flex min-h-10 max-w-full items-start gap-1 rounded-xl py-1 text-left text-zinc-600 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
                >
                  <span>{contactAddress}</span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                </a>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reader-touch-link reader-focus-ring mt-2 inline-flex min-h-10 items-center gap-1 rounded-xl py-1 text-xs font-semibold text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300"
                >
                  {t.openMapLabel}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="font-semibold">{t.phoneCardLabel}</p>
                <a
                  href={COMPANY_INFO.contact.phoneHref}
                  className="reader-touch-link reader-focus-ring mt-1 inline-flex min-h-10 items-center rounded-xl py-1 text-zinc-600 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
                >
                  {COMPANY_INFO.contact.phoneDisplay}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="font-semibold">{t.emailCardLabel}</p>
                <a
                  href={`mailto:${COMPANY_INFO.contact.email}`}
                  className="reader-touch-link reader-focus-ring mt-1 inline-flex min-h-10 items-center rounded-xl py-1 break-all text-zinc-600 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
                >
                  {COMPANY_INFO.contact.email}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="font-semibold">{t.officeHoursLabel}</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">{t.officeHoursValue}</p>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t.responseTimeLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {t.responseTimeValue}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t.quickActionsTitle}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <a
                  href={COMPANY_INFO.contact.phoneHref}
                  className="reader-touch-link reader-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-orange-400 hover:text-orange-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-orange-500 dark:hover:text-orange-300"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {t.callNowLabel}
                </a>
                <a
                  href={`mailto:${COMPANY_INFO.contact.email}`}
                  className="reader-touch-link reader-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-orange-400 hover:text-orange-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-orange-500 dark:hover:text-orange-300"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {t.emailNowLabel}
                </a>
              </div>
              <a
                href={COMPANY_INFO.owner.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="reader-touch-link reader-focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-orange-400 hover:text-orange-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-orange-500 dark:hover:text-orange-300"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {t.whatsappLabel}
              </a>
            </div>
          </div>
        </aside>
      </div>

      <div className="cnp-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 sm:text-xl">
          {t.faqTitle}
        </h2>
        <div className="mt-4 space-y-2">
          {t.faqItems.map((item) => (
            <details
              key={item.q}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {item.q}
              </summary>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
