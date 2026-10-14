//! The questions at the end of TS `buildBrandingPrompt`, numbered by which
//! sections the prompt has.

use super::super::LlmInput;
use super::Context;

fn button_tasks(p: &mut String, buttons: usize) {
  p.push_str(&format!(
    "1. **PRIMARY Button**: Identify which button (by index 0-{}) is the main call-to-action.\n",
    buttons - 1
  ));
  p.push_str("   - **CRITICAL**: Buttons with VIBRANT/BRAND COLOR backgrounds (like green, blue, orange) are ALMOST ALWAYS the primary CTA\n");
  p.push_str("   - **STRONG INDICATORS**: Look for these class patterns (very high priority):\n");
  p.push_str("     * `bg-brand-400`, `bg-brand-500`, or similar brand utility classes\n");
  p.push_str("     * `bg-green-*`, `bg-blue-*`, `bg-purple-*` with high numbers (400+)\n");
  p.push_str("     * Any class containing \"brand\", \"primary\", or \"cta\"\n");
  p.push_str("   - Look for: Bright, saturated colors (green, blue, purple, orange) + action-oriented text\n");
  p.push_str("   - Action-oriented text examples: \"Get Started\", \"Sign Up\", \"Start Free\", \"Start your Project\", \"Try Now\", \"Get Started Free\"\n");
  p.push_str(
    "   - If a button has BOTH vibrant color AND strong CTA text, it's DEFINITELY the primary\n",
  );
  p.push_str("   - Avoid buttons with transparent, white, or muted gray backgrounds UNLESS no vibrant buttons exist\n");
  p.push_str("   - Return the button INDEX (not text) and explain your reasoning\n\n");

  p.push_str("2. **SECONDARY Button**: Identify which button is secondary (outline, ghost, or less prominent).\n");
  p.push_str("   - **CRITICAL**: MUST have a DIFFERENT background color than the primary button you selected\n");
  p.push_str("   - **EXAMPLES OF VALID COMBINATIONS**:\n");
  p.push_str(
    "     * Primary: #00C853 (green, vibrant) → Secondary: transparent (outline style) ✓\n",
  );
  p.push_str("     * Primary: #1976D2 (blue, vibrant) → Secondary: #FFFFFF (white/light) ✓\n");
  p.push_str("     * Primary: #FF6B35 (orange, vibrant) → Secondary: #F5F5F5 (gray/subtle) ✓\n");
  p.push_str("   - **INVALID COMBINATION**:\n");
  p.push_str("     * Primary: #00C853 → Secondary: #00C853 ✗ SAME COLOR - NOT ALLOWED!\n");
  p.push_str("   - Usually has transparent/subtle background, border, or muted colors\n");
  p.push_str(
    "   - Common for actions like \"Login\", \"Learn More\", \"Contact\", \"Documentation\"\n",
  );
  p.push_str("   - Often has an outline/border instead of filled background\n");
  p.push_str("   - Look at the COLOR GROUPS above - pick from a DIFFERENT group than primary\n");
  p.push_str("   - If all remaining buttons have the same color as primary, set secondaryButtonIndex to -1\n");
  p.push_str("   - Return the button INDEX and reasoning\n\n");
}

fn page_tasks(p: &mut String, has_buttons: bool) {
  let n = |with: &str, without: &str| if has_buttons { with } else { without }.to_string();
  p.push_str(&format!(
    "{}. **Color Roles**: Based on {}page context:\n",
    n("3", "1"),
    n("button colors and ", "")
  ));
  p.push_str("   - PRIMARY brand color: the saturated brand/CTA color (logo fill, primary button). NOT the header/nav chrome, NOT near-black navy on a light page, NOT the page background.\n");
  p.push_str("   - SECONDARY brand color (a complementary color distinct from primary, often used for secondary headings, supporting UI elements, or alternate brand visuals. Return \"\" if no clear secondary color exists)\n");
  p.push_str(&format!(
    "   - ACCENT color ({})\n",
    n(
      "usually the vibrant CTA button background - green, blue, etc.",
      "vibrant accent color from the page"
    )
  ));
  p.push_str("   - Background and text colors\n");
  p.push_str("   - Return hex only (#RRGGBB). If unsure about any color, return an empty string \"\" for that field (NOT null)\n\n");

  p.push_str(&format!(
    "{}. **Brand Personality**: Overall tone, energy, and target audience\n",
    n("4", "2")
  ));
  p.push_str("   - If unsure about target audience, return \"unknown\"\n\n");

  p.push_str(&format!(
    "{}. **Design System**: Based on the class patterns shown above:\n",
    n("5", "3")
  ));
  p.push_str("   - **Framework**: Identify the CSS framework (tailwind/bootstrap/material/chakra/custom/unknown)\n");
  p.push_str("   - **Component Library**: Look for prefixes like `radix-`, `shadcn-`, `headlessui-`, or `react-aria-` in classes\n");
  p.push_str("   - If using Tailwind + a component library, identify both (e.g., framework: tailwind, componentLibrary: \"radix-ui\")\n");
  p.push_str("   - If no component library is detected, return an empty string \"\"\n\n");

  p.push_str(&format!(
    "{}. **Clean Fonts**: Return up to 5 cleaned, human-readable font names\n",
    n("6", "4")
  ));
  p.push_str("   - Remove framework obfuscation (Next.js hashes, etc.)\n");
  p.push_str("   - Filter out generics and CSS variables\n");
  p.push_str("   - Prioritize by frequency (shown in usage count)\n");
  p.push_str(
    "   - Assign appropriate roles (heading, body, monospace, display) or \"unknown\"\n\n",
  );
}

fn logo_task(p: &mut String, cx: &Context) {
  let input = cx.input;
  let count = input.logo_candidates.len();
  let brand = |fallback: &'static str| {
    if cx.brand.is_empty() {
      fallback.to_string()
    } else {
      cx.brand.clone()
    }
  };
  p.push_str(&format!(
    "{}. **Logo Selection**: Identify the best brand logo from the {count} candidates provided above.\n",
    if input.buttons.is_empty() { "5" } else { "7" }
  ));
  if let Some(pick) = &input.heuristic_pick {
    p.push_str(&format!("   - **Heuristic suggested #{}.** Confirm it (return the same index with reasoning) OR pick a different index; if you pick differently, explain why the heuristic was wrong and why your choice is better.\n", pick.index));
  }
  p.push_str("   - **YOU MUST RETURN**: selectedLogoIndex (number), selectedLogoReasoning (string), and confidence (0-1)\n");
  p.push_str(&format!("   - **CRITICAL**: NEVER pick a tiny/invisible/UI icon. Prefer the MAIN visible header logo (medium/large size, isVisible:true, alt like \"{} Home\").\n", brand("Brand")));
  p.push_str("   - **IT'S OK TO RETURN -1**: If no candidate is a good brand logo, return -1 with low confidence\n");
  p.push_str("   - **DECISION PROCESS**:\n");
  if input.screenshot.is_some() {
    p.push_str("     1. Look at the screenshot - find the MAIN logo in the HEADER (the one users see, not a tiny icon)\n");
    p.push_str("     2. Match that visual to a candidate; prefer isVisible:true and larger size\n");
  } else {
    p.push_str("     1. Filter by isVisible:true and size (prefer medium/large over tiny/small)\n");
    p.push_str(&format!("     2. Prefer candidates with alt matching brand (e.g. \"{} Home\"), href=home, in header\n", brand("Brand")));
  }
  p.push_str("     3. Reject any candidate with alt containing \"menu\", \"hamburger\", \"toggle\", \"mobile menu\", \"close\"\n");
  p.push_str("     4. If multiple candidates share the same href, pick the LARGER one (primary logo), not the smaller/hidden variant\n");
  p.push_str("     5. If you're unsure or only tiny/invisible candidates remain, return -1\n");
  p.push_str("   - **STRONG INDICATORS** (prioritize candidates with these):\n");
  p.push_str("     * isVisible:true AND size medium/large (not tiny) → The main logo users see\n");
  p.push_str("     * \"href:/\" or \"hrefMatch\" → Logo links to homepage (VERY STRONG)\n");
  p.push_str(&format!(
    "     * \"header\" + alt like \"{} Home\" → Primary brand logo\n",
    brand("brand name")
  ));
  p.push_str("     * Larger width×height when same href as other candidates → Primary; smaller = collapsed/mini variant\n");
  p.push_str("   - **AVOID** (do NOT pick these; return -1 if only these remain):\n");
  p.push_str("     * isVisible:false when another candidate has isVisible:true\n");
  p.push_str("     * Size \"tiny\" or \"small\" when a \"medium\"/\"large\" header logo exists\n");
  p.push_str("     * Alt/ariaLabel containing: menu, hamburger, toggle, \"mobile menu\", \"menu open\", \"menu close\"\n");
  p.push_str("     * Very large images (og:image, hero, banners)\n");
  p.push_str("     * UI icons (search, hamburger, cart, user, settings)\n");
  p.push_str("     * Customer/client/footer logos\n");
  p.push_str("   - **RETURN FORMAT**:\n");
  p.push_str(&format!(
    "     * selectedLogoIndex: The INDEX (0-{}) of the best logo, or -1 if none are good\n",
    count - 1
  ));
  p.push_str("     * selectedLogoReasoning: \"Selected #X because [isVisible, medium/large, header, href=home, alt=brand].\" OR \"No valid brand logo - only tiny/invisible/UI icons.\"\n");
  p.push_str("     * confidence: 0.8-1.0 if sure, 0.5-0.7 if uncertain, 0.0-0.4 if no good match or returning -1\n");
  p.push_str("   - **PREFER -1 OVER BAD LOGOS**: Better to return no logo than a menu/hamburger icon or tiny hidden variant.\n\n");
}

fn button_checklist(p: &mut String) {
  p.push_str("## VALIDATION CHECKLIST - VERIFY BEFORE RESPONDING:\n");
  p.push_str("Before finalizing your answer, check:\n");
  p.push_str("1. ✓ Are primaryButtonIndex and secondaryButtonIndex DIFFERENT numbers?\n");
  p.push_str(
    "2. ✓ Do they have DIFFERENT background colors? (Compare the actual hex/color values)\n",
  );
  p.push_str("3. ✓ If you selected buttons from the same COLOR GROUP, go back and pick a different secondary\n");
  p.push_str("4. ✓ If no valid secondary exists (all buttons same color as primary), set secondaryButtonIndex to -1\n\n");

  p.push_str("## FINAL RULES:\n");
  p.push_str("- Primary and secondary buttons MUST have different background colors (not just different shades - completely different colors)\n");
  p.push_str("- Primary and secondary buttons MUST be different buttons (different indices)\n");
  p.push_str(
    "- Refer to the COLOR GROUPS section above to ensure you're picking from different groups\n",
  );
  p.push_str("- Be decisive and confident. Prioritize vibrant, saturated colors over neutral ones for primary buttons\n");
  p.push_str(
    "- If no clear primary/secondary exists with different colors, return -1 for that index\n",
  );
}

/// `## Your Task` through the button checklist.
pub fn tasks(p: &mut String, cx: &Context) {
  let has_buttons = !cx.input.buttons.is_empty();
  p.push_str("\n## Your Task:\n");
  if has_buttons {
    button_tasks(p, cx.input.buttons.len());
  }
  page_tasks(p, has_buttons);
  if !cx.input.logo_candidates.is_empty() {
    logo_task(p, cx);
  }
  if has_buttons {
    button_checklist(p);
  }
}

pub fn required_fields(p: &mut String, input: &LlmInput) {
  p.push_str("\n## ⚠️ CRITICAL: YOU MUST RETURN ALL REQUIRED FIELDS\n");
  p.push_str("The response schema REQUIRES these fields. DO NOT return empty objects {}.\n");
  p.push_str("\n**REQUIRED FIELDS:**\n");
  let mut field = 1;
  if !input.buttons.is_empty() {
    p.push_str(&format!("{field}. buttonClassification: {{ primaryButtonIndex, primaryButtonReasoning, secondaryButtonIndex, secondaryButtonReasoning, confidence }}\n"));
    field += 1;
  }
  p.push_str(&format!("{field}. colorRoles: {{ primaryColor, secondaryColor, accentColor, backgroundColor, textPrimary, confidence }}\n"));
  field += 1;
  p.push_str(&format!(
    "{field}. cleanedFonts: [] (array, can be empty but must be present)\n"
  ));
  if input.logo_candidates.is_empty() {
    p.push_str("(No logoSelection required — there are no logo candidates.)\n");
  } else {
    p.push_str(&format!(
      "{}. logoSelection: {{ selectedLogoIndex, selectedLogoReasoning, confidence }}\n",
      field + 1
    ));
  }
  p.push_str("\n**DO NOT** return empty objects {}. Fill in ALL fields with actual values or -1/null as appropriate.\n");
}
