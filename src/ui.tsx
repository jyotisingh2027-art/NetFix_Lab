import React from 'react';

export function FileCard({ children }: { children: React.ReactNode }) {
    return <main className="page">{children}</main>;
}
export function Paragraph({ children }: { children: React.ReactNode }) {
    return <p className="para">{children}</p>;
}
export function Callout({ title, children }: { title: string; tone?: string; children: React.ReactNode }) {
    return <div className="callout"><strong>{title}</strong><p>{children}</p></div>;
}
export function Group({ label, children }: { label: string; heading?: boolean; children: React.ReactNode }) {
    return <section className="group"><h2>{label}</h2>{children}</section>;
}
