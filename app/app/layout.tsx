import { QueryClient, dehydrate } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import { AppLayoutClient } from './AppLayoutClient';
import { getAppBootstrapData } from './serverBootstrap';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bootstrap = await getAppBootstrapData();
  if (!bootstrap) {
    redirect('/login');
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
      },
    },
  });

  queryClient.setQueryData(['servers'], { servers: bootstrap.servers });
  const dehydratedState = dehydrate(queryClient);

  return (
    <AppLayoutClient initialUser={bootstrap.user} dehydratedState={dehydratedState} licenseAccepted={bootstrap.licenseAccepted}>
      {children}
    </AppLayoutClient>
  );
}
