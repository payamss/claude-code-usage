'use client';

import { useT } from '@/lib/i18n';

const TERMS = ['apicalls', 'toolcalls', 'prompts', 'output', 'think', 'cacheread', 'cachewrite', 'input', 'ctx', 'startup', 'misses', 'ingest', 'carry', 'outcost', 'cost', 'reported', 'subagents', 'apitime', 'retention', 'prices'];

export default function HelpView() {
  const { t } = useT();
  return (
    <>
      <h2 className="text-xl font-semibold mb-3">{t('help.title')}</h2>
      <section className="prose bg-surface border border-line rounded-xl p-4 leading-relaxed">
        <div dangerouslySetInnerHTML={{ __html: t('help.intro') }} />
        <h3>{t('help.terms')}</h3>
        <dl className="prose-cols">
          {TERMS.map((k) => (
            <div key={k} className="mb-3">
              <dt>{t('term.' + k)}</dt>
              <dd>{t('gloss.' + k)}</dd>
            </div>
          ))}
        </dl>
        <div className="prose-cols" dangerouslySetInnerHTML={{ __html: t('help.attribution') }} />
      </section>
    </>
  );
}
