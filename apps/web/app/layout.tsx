import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Blueline — buildable, unstamped construction documents',
  description:
    'Interview → guided floor-plan editor → complete IRC-prescriptive construction document set. Buildable, unstamped, in under an hour.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
