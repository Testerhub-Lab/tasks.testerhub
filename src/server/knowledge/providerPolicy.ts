import { KnowledgeProvider } from "@prisma/client";

export type KnowledgeConfiguration = {
  provider: KnowledgeProvider;
  externalUrl: string | null;
};

export function getKnowledgeHomeHref(
  projectKey: string,
  configuration: KnowledgeConfiguration
): string | null {
  if (configuration.provider === KnowledgeProvider.NATIVE) {
    return `/wiki/${encodeURIComponent(projectKey)}`;
  }
  if (
    configuration.provider === KnowledgeProvider.EXTERNAL &&
    configuration.externalUrl
  ) {
    return configuration.externalUrl;
  }
  return null;
}

export function isNativeKnowledgeEnabled(
  configuration: KnowledgeConfiguration | null
): boolean {
  return configuration?.provider === KnowledgeProvider.NATIVE;
}
