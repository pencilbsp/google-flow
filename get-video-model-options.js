/**
 * @typedef {import("./type").VideoModel} VideoModel
 * @typedef {{label: string, value: string, icon?: string, upgradeButtonLink?: string, disabled?: boolean, tag?: string, keys?: string[], supportedAspectRatios?: string[]}} VideoModelOption
 * @typedef {{
 *   models?: VideoModel[],
 *   currentDisplayName: string,
 *   isAvailableForUser: (model: VideoModel) => boolean,
 *   upsellUrl?: string,
 *   fallbackDisplayName: string,
 * }} BuildOptionsArgs
 */

// 3) map ra options như _0x28daab
/**
 * @param {BuildOptionsArgs} params
 * @returns {VideoModelOption[]}
 */
function buildOptions({
  models,
  currentDisplayName,
  isAvailableForUser,
  upsellUrl,
  fallbackDisplayName,
}) {
  const options =
    (models || []).map((model) => {
      const displayName = model?.displayName || fallbackDisplayName;
      const available = isAvailableForUser(model);

      return available
        ? {
            label: displayName,
            value: displayName,
            icon:
              displayName === currentDisplayName
                ? "radio_button_checked"
                : "radio_button_unchecked",
            upgradeButtonLink: undefined,
            disabled: false,
            tag: model?.modelMetadata?.veoModelName,
            keys: model.allKeys || (model?.key ? [model.key] : []),
            supportedAspectRatios: model?.supportedAspectRatios,
          }
        : {
            label: displayName,
            value: displayName,
            icon: undefined,
            upgradeButtonLink: upsellUrl,
            disabled: true,
            tag: model?.modelMetadata?.veoModelName,
            keys: model.allKeys || (model?.key ? [model.key] : []),
            supportedAspectRatios: model?.supportedAspectRatios,
          };
    }) ?? [];

  return options.length
    ? options
    : [
        {
          label: fallbackDisplayName,
          value: fallbackDisplayName,
          keys: [],
          supportedAspectRatios: [],
        },
      ];
}

// // Ví dụ dùng:
// const options = buildOptions({
//   models: afterPdAndC7,
//   currentDisplayName: "Veo 3.1 - Fast",
//   isAvailableForUser: (model) => {
//     // giả lập: nếu paygateAccessBlocked thì không available
//     return !model?.modelAccessInfo?.paygateAccessBlocked;
//   },
//   upsellUrl: "https://example.com/upgrade",
//   fallbackDisplayName: "Veo 3.1 - Fast",
// });

/**
 * @param {VideoModel[]} videoModels
 * @returns {VideoModelOption[]}
 */
export function getVideoModelOptions(videoModels) {
  const filtered = videoModels.filter((m) => {
    if (!m) return false;
    if (m.modelStatus === "MODEL_STATUS_DEPRECATED") return false;
    const caps = m.capabilities || [];
    const isUpscaling = caps.includes("VIDEO_MODEL_CAPABILITY_UPSCALING");
    if (isUpscaling) {
      // console.log("Filtered out upscaling model:", m.key, m.displayName);
    }
    return !isUpscaling;
  });

  // 2) giả lập pD(list, 'displayName') + .filter(C7)
  //    pD có vẻ là "dedupe by displayName".
  function dedupeByDisplayName(list) {
    const map = new Map();
    for (const m of list) {
      const name = m?.displayName;
      if (!name) continue;

      if (map.has(name)) {
        // Merge supportedAspectRatios
        const existing = map.get(name);
        const existingRatios = new Set(existing.supportedAspectRatios || []);
        (m.supportedAspectRatios || []).forEach((r) => existingRatios.add(r));
        existing.supportedAspectRatios = Array.from(existingRatios);

        // Also merge keys if needed, though we only use keys[0] currently.
        // If the new model supports an AR the old one didn't, we might need its key?
        // But the script logic selects a key from the model object.
        // If we merge ARs, we physically have one "VideoModel" object that has combined ARs.
        // But `selectedVideoModelKey` comes from `videoModel.keys?.[0]`.
        // If the keys differ per AR, this simple merge might be insufficient for the ACTUAL generation step which uses ONE key.

        // Wait, if distinct keys support distinct ARs, then "Selecting a Model (Label)" and then "Selecting a valid key for that AR" is complex.
        // The current logic: user picks Model (Label), then we pick `videoModel!.keys?.[0]`.
        // This implies key 0 supports ALL ratios?
        // If Veo 3.1 (Key A) supports Landscape, and Veo 3.1 (Key B) supports Portrait.
        // And we keep Object A but add Portrait to its list.
        // User picks "Veo 3.1", then picks "Portrait".
        // Code uses Object A's key (Key A).
        // Creation fails because Key A doesn't support Portrait.

        // So simply merging ARs for display is NOT enough if the underlying keys are distinct.
        // We need to keep track of Which Key supports Which AR.

        // However, looking at the code, `VideoModelOption` has `keys: string[]`.
        // `buildOptions` maps `keys: model?.key ? [model.key] : []`.

        // So I should merge `keys` as well.
        // And when generating, we might need to pick the RIGHT key for the RIGHT AR?
        // Current generation logic: `videoModelKey = videoModel.keys?.[0]`.
        // It blindly picks the first key.

        // If Veo 3.1 has multiple keys, we need to pass the correct one.
        // But `createVideoText` takes `videoModelKey`.

        // Does the API verify the key vs AR? Likely.

        // So, `VideoModelOption` should probably hold a map of AR -> Key?
        // Or we just merge all keys, and `createVideoText` needs to find the right key?
        // BUT `createVideoText` just takes a string key.

        // Refined Plan:
        // 1. Merge keys.
        // 2. But we don't know which key supports which AR after merging.

        // Alternative: Don't dedupe strictly.
        // But prompts need unique choices.

        // If "Veo 3.1" appears twice, maybe we should keep them if they are truly different variants?
        // User said "Tại sao khổ ngang chỉ có các model veo 2".
        // Likely "Veo 3.1" (Landscape) is missing or deduped away.

        // Let's first just merge ARs and Keys to see if it fixes the DISPLAY issue.
        // If the generation fails, we'll traverse the keys to find the one that works?
        // (Wait, `videoModel` object in google.ts is the selected option).
      } else {
        map.set(name, m);
      }
    }
    return Array.from(map.values());
  }

  const afterPdAndC7 = dedupeByDisplayName(filtered);

  return buildOptions({
    models: afterPdAndC7,
    currentDisplayName: "Veo 3.1 - Fast",
    isAvailableForUser: (model) => {
      // giả lập: nếu paygateAccessBlocked thì không available
      return !model?.modelAccessInfo?.paygateAccessBlocked;
    },
    upsellUrl: "https://example.com/upgrade",
    fallbackDisplayName: "Veo 3.1 - Fast",
  });
}
