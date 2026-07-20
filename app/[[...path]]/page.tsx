import { PlatformApp } from "@/components/platform-app";

export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  return <PlatformApp initialPath={`/${path.join("/")}`} />;
}
