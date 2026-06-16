import { HomeClient } from './HomeClient';
import { redirect } from 'next/navigation';
import { getAppBootstrapData } from './app/serverBootstrap';

// Prevent CDN/edge caching mixing RSC and full HTML.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const bootstrap = await getAppBootstrapData();
  if (bootstrap) {
    redirect('/app');
  }

  return <HomeClient />;
}
