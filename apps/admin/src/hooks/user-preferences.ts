import { useQuery, useMutation, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { z } from "zod";

import { useQueryClient } from "@tryghost/admin-x-framework";
import { useCurrentUser } from "@tryghost/admin-x-framework/api/currentUser";
import { useEditUser, type User } from "@tryghost/admin-x-framework/api/users";

const WhatsNewPreferencesCodec = z.codec(
    z.object({ lastSeenDate: z.iso.datetime() }),
    z.object({ lastSeenDate: z.date() }),
    {
        decode: (stored) => ({ lastSeenDate: new Date(stored.lastSeenDate) }),
        encode: (working) => ({ lastSeenDate: working.lastSeenDate.toISOString() }),
    }
);

const PreferencesCodec = z.codec(
    z.looseObject({ whatsNew: z.object({ lastSeenDate: z.iso.datetime() }).optional() }),
    z.looseObject({ whatsNew: z.object({ lastSeenDate: z.date() }).optional() }),
    {
        decode: (stored) => ({
            ...stored,
            whatsNew: stored.whatsNew ? WhatsNewPreferencesCodec.decode(stored.whatsNew) : undefined,
        }),
        encode: (working) => ({
            ...working,
            whatsNew: working.whatsNew ? WhatsNewPreferencesCodec.encode(working.whatsNew) : undefined,
        }),
    }
);

export type Preferences = z.infer<typeof PreferencesCodec>;
export type WhatsNewPreferences = z.output<typeof WhatsNewPreferencesCodec>;

const userPreferencesQueryKey = (user: User | undefined) => ["userPreferences", user?.id, user?.accessibility] as const;

export const useUserPreferences = (): UseQueryResult<Preferences> => {
    const { data: user } = useCurrentUser();

    return useQuery({
        queryKey: userPreferencesQueryKey(user),
        queryFn: () => {
            if (!user) {
                throw new Error("User not loaded");
            }

            const raw = user.accessibility || "{}";
            const parsed = JSON.parse(raw) as unknown;

            return PreferencesCodec.parse(parsed);
        },
        enabled: !!user,
        staleTime: Infinity,
        // Query key includes user?.accessibility to automatically react to changes from ANY source
        // (our mutation, other code calling editUser, external updates, etc.). When accessibility
        // changes, the query key changes, making the old cache entry inactive. cacheTime: 0 ensures
        // orphaned entries are immediately garbage collected, preventing memory leaks while keeping
        // the current active entry cached indefinitely.
        cacheTime: 0,
    });
};

export const useEditUserPreferences = (): UseMutationResult<void, Error, Preferences, unknown> => {
    const queryClient = useQueryClient();
    const { data: user } = useCurrentUser();
    const { mutateAsync: editUser } = useEditUser();

    return useMutation({
        mutationFn: async (updatedPreferences: Preferences) => {
            if (!user) {
                throw new Error("User is not loaded");
            }

            const currentPreferences = queryClient.getQueryData<Preferences>(userPreferencesQueryKey(user)) ?? {};

            const newPreferences: Preferences = {
                ...currentPreferences,
                ...updatedPreferences,
            };

            // Encode preferences for storage (recursively encodes all child codecs)
            const encodedForStorage = PreferencesCodec.encode(newPreferences);

            await editUser({
                ...user,
                accessibility: JSON.stringify(encodedForStorage),
            });
        },
    });
};
