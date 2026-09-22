import OverviewView from '@/components/OverviewView';

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <OverviewView project={decodeURIComponent(key)} />;
}
