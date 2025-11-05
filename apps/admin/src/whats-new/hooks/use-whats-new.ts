import { useEffect } from "react";
import { useQuery, useMutation, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import {
    useUserPreferences,
    useEditUserPreferences,
    type Preferences,
    type WhatsNewPreferences,
} from "@/hooks/user-preferences";
import { useChangelog, type ChangelogEntry } from "./use-changelog";

function getDefaultWhatsNewPreferences(): WhatsNewPreferences {
    return {
        lastSeenDate: new Date(),
    };
}

interface WhatsNewData {
    hasNew: boolean;
    hasNewFeatured: boolean;
}

const whatsNewQueryKey = (preferences: Preferences | undefined, latestEntry: ChangelogEntry | undefined) =>
    ["whatsNew", preferences?.whatsNew?.lastSeenDate.toISOString(), latestEntry?.publishedAt.toISOString()] as const;

export const useWhatsNew = (): UseQueryResult<WhatsNewData> => {
    const { data: preferences, isSuccess: isPreferencesLoaded } = useUserPreferences();
    const { data: changelog, isSuccess: isChangelogLoaded } = useChangelog();
    const { mutateAsync: updatePreferences } = useEditUserPreferences();

    const hasWhatsNewPreferences = !!preferences?.whatsNew;

    // Initialize default whatsNewPreferences if missing
    useEffect(() => {
        if (!hasWhatsNewPreferences && isPreferencesLoaded) {
            void updatePreferences({
                whatsNew: getDefaultWhatsNewPreferences(),
            });
        }
    }, [hasWhatsNewPreferences, isPreferencesLoaded, updatePreferences]);

    const latestEntry = changelog?.entries[0];

    return useQuery({
        queryKey: whatsNewQueryKey(preferences, latestEntry),
        queryFn: () => {
            if (!latestEntry) {
                return { hasNew: false, hasNewFeatured: false };
            }

            // Safe to assert non-null because query is only enabled when hasWhatsNewPreferences is true
            const whatsNewPreferences = preferences!.whatsNew!;

            const hasNew = latestEntry.publishedAt > whatsNewPreferences.lastSeenDate;
            const hasNewFeatured = hasNew && latestEntry.featured === true;

            return { hasNew, hasNewFeatured };
        },
        enabled: isPreferencesLoaded && isChangelogLoaded && hasWhatsNewPreferences,
        staleTime: Infinity,
        cacheTime: 0,
    });
};

export const useDismissWhatsNew = (): UseMutationResult<void, Error, void, unknown> => {
    const { data: changelog } = useChangelog();
    const { mutateAsync: updatePreferences } = useEditUserPreferences();

    return useMutation({
        mutationFn: async () => {
            const latestEntry = changelog?.entries[0];

            if (!latestEntry) {
                return;
            }

            const newPreferences: WhatsNewPreferences = {
                lastSeenDate: latestEntry.publishedAt,
            };

            await updatePreferences({
                whatsNew: newPreferences,
            });
        },
    });
};
