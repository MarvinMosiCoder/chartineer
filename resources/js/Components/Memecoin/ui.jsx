import React from 'react';
import { usePage } from '@inertiajs/react';

export function usePathname() { return usePage().url.split('?')[0]; }
export function useAuth() { return { user: usePage().props.auth?.user }; }

export function TextInput({ className = '', ...props }) {
    return <input {...props} className={`min-w-0 w-full rounded-md border border-meme-border bg-meme-bg px-3 py-2 text-sm text-meme-text placeholder:text-meme-dim focus:border-meme-accent focus:outline-none focus:ring-1 focus:ring-meme-accent ${className}`} />;
}

function Button({ className = '', children, tone, type = 'button', ...props }) {
    const style = tone === 'danger' ? 'border-red-500/40 bg-meme-danger-soft text-meme-danger' : tone === 'primary' ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700' : 'border-meme-border text-meme-text hover:bg-meme-bg';
    return <button {...props} type={type} className={`inline-flex items-center justify-center rounded-md border px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${style} ${className}`}>{children}</button>;
}

export function PrimaryButton(props) { return <Button type="submit" {...props} tone="primary" />; }
export function SecondaryButton(props) { return <Button {...props} tone="secondary" />; }
export function DangerButton(props) { return <Button {...props} tone="danger" />; }
