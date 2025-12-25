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
            keys: model?.key ? [model.key] : [],
            supportedAspectRatios: model?.supportedAspectRatios,
          }
        : {
            label: displayName,
            value: displayName,
            icon: undefined,
            upgradeButtonLink: upsellUrl,
            disabled: true,
            tag: model?.modelMetadata?.veoModelName,
            keys: model?.key ? [model.key] : [],
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
    return !caps.includes("VIDEO_MODEL_CAPABILITY_UPSCALING");
  });

  // 2) giả lập pD(list, 'displayName') + .filter(C7)
  //    pD có vẻ là "dedupe by displayName".
  function dedupeByDisplayName(list) {
    const seen = new Set();
    const out = [];
    for (const m of list) {
      const name = m?.displayName;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(m);
    }
    return out;
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
