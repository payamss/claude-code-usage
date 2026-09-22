import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css';

// Farsi text is set in Vazirmatn (self-hosted by next/font); Latin UI keeps the system font.
const vazir = Vazirmatn({ subsets: ['arabic', 'latin'], variable: '--font-vazir', display: 'swap' });
import { I18nProvider } from '@/lib/i18n';
import { AppProvider } from '@/lib/app-context';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SessionDrawer from '@/components/SessionDrawer';

export const metadata: Metadata = {
  title: 'Claude Code Usage',
  description: 'Local dashboard for Claude Code token usage and cost',
};

// Applies the saved theme before first paint to avoid a flash.
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');var l=localStorage.getItem('lang');if(l){document.documentElement.lang=l;document.documentElement.dir=l==='fa'?'rtl':'ltr';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${vazir.variable} min-h-screen bg-page text-ink`}>
        <I18nProvider>
          <AppProvider>
            <div className="mx-auto w-full max-w-[1700px] px-4 pb-12">
              <Header />
              <main>{children}</main>
              <Footer />
            </div>
            <SessionDrawer />
          </AppProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
