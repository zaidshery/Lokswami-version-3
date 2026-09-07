'use client';

import React, { forwardRef } from 'react';
import { MessageSquare, Phone } from 'lucide-react';
import FormInput, { type FormInputProps } from './FormInput';
import { formatPhoneDisplay } from '@/lib/utils/phone';

export interface WhatsAppPhoneInputProps
  extends Omit<FormInputProps, 'type' | 'leftIcon' | 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
}

export const WhatsAppPhoneInput = forwardRef<HTMLInputElement, WhatsAppPhoneInputProps>(
  function WhatsAppPhoneInput({ value = '', onChange, ...props }, ref) {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow user to type numbers, plus, and spaces
      const digits = raw.replace(/[^\d+]/g, '');
      onChange?.(digits);
    };

    return (
      <div className="w-full">
        <FormInput
          ref={ref}
          type="tel"
          value={formatPhoneDisplay(value) || value}
          onChange={handleInputChange}
          placeholder="+91 98765 43210"
          leftIcon={
            <div className="flex items-center gap-1.5 border-r border-zinc-200 pr-2 dark:border-zinc-700">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                <MessageSquare className="h-3 w-3 fill-current" />
              </div>
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">+91</span>
            </div>
          }
          className="pl-20"
          {...props}
        />
      </div>
    );
  }
);

export default WhatsAppPhoneInput;
