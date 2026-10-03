"use client"
import dynamic from 'next/dynamic'
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const IDE = dynamic(() => import('@/components/ide/IDE').then(m => m.IDE), { ssr: false })

function WorkspaceIDE() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  if (!id) return <div>Missing Workspace ID</div>;
  return <IDE workspaceId={id} />;
}

export default function IdePage() {
  return (
    <Suspense fallback={<div>Loading IDE...</div>}>
      <WorkspaceIDE />
    </Suspense>
  );
}
