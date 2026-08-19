/*
 * Built-in card icons for the STANDALONE form.
 *
 * Context-free and self-contained: it reads no host context, imports no native module, and needs no
 * merchant prop. Rendering is plain React Native `Image` over packaged PNGs — deliberately not
 * `react-native-svg`, which is a native module and would cost this package its "no native module,
 * no Pod install, no Codegen" property.
 *
 * Behaviour matches hyperswitch-client-core's `Standard` mode exactly:
 *   - a detected scheme with packaged artwork -> that icon;
 *   - a detected scheme without artwork       -> `waitcard`;
 *   - no scheme detected                      -> `waitcard`;
 *   - no fade, no scale, no cross-fade, no rotation.
 *
 * `Animated` mode (client-core's delay/fade placeholder cycle) is NOT implemented here and is not
 * part of this phase.
 */

open ReactNative

/* The static asset table. Every entry is a literal import, so Metro can pick @1x/@2x/@3x. */
type assetTable = {
  visa: Image.Source.t,
  mastercard: Image.Source.t,
  americanexpress: Image.Source.t,
  dinersclub: Image.Source.t,
  discover: Image.Source.t,
  jcb: Image.Source.t,
  cartesbancaires: Image.Source.t,
  interac: Image.Source.t,
  waitcard: Image.Source.t,
  cvv: Image.Source.t,
}

@module("./cardIconAssets.mjs") external assets: assetTable = "cardIconAssets"

/*
 * Every issuer `Validation.cardPatterns` can return, as a closed variant.
 *
 * Closed on purpose: a new detected issuer cannot be added to sdk-utils and silently render nothing
 * here, because `fromDetectedName` and `artworkFor` both stop compiling until someone makes an
 * explicit artwork-or-fallback decision for it.
 */
type detectedScheme =
  | Visa
  | Mastercard
  | AmericanExpress
  | DinersClub
  | Discover
  | JCB
  | CartesBancaires
  | Interac
  | RuPay
  | UnionPay
  | Maestro
  | Bajaj
  | Sodexo
  | Unrecognised

/*
 * Normalises exactly as client-core does before an icon lookup: `Icon.res` lower-cases the name
 * before matching. The detector returns mixed casing — "AmericanExpress", "CartesBancaires",
 * "RuPay", "BAJAJ", "SODEXO" — so lower-casing is required, not cosmetic.
 */
let fromDetectedName = (name: string): detectedScheme =>
  switch name->String.trim->String.toLowerCase {
  | "visa" => Visa
  | "mastercard" => Mastercard
  | "americanexpress" => AmericanExpress
  | "dinersclub" => DinersClub
  | "discover" => Discover
  | "jcb" => JCB
  | "cartesbancaires" => CartesBancaires
  | "interac" => Interac
  | "rupay" => RuPay
  | "unionpay" => UnionPay
  | "maestro" => Maestro
  | "bajaj" => Bajaj
  | "sodexo" => Sodexo
  | _ => Unrecognised
  }

/*
 * Exhaustive artwork mapping for all 13 issuers.
 *
 * Five have no approved artwork yet and fall back to `waitcard`. That is a deliberate, visible
 * decision rather than an accident: the accessory is never empty, and no dynamic require is ever
 * attempted.
 */
let artworkFor = (scheme: detectedScheme): Image.Source.t =>
  switch scheme {
  | Visa => assets.visa
  | Mastercard => assets.mastercard
  | AmericanExpress => assets.americanexpress
  | DinersClub => assets.dinersclub
  | Discover => assets.discover
  | JCB => assets.jcb
  | CartesBancaires => assets.cartesbancaires
  | Interac => assets.interac
  /* No approved artwork yet — render the neutral card placeholder. */
  | RuPay
  | UnionPay
  | Maestro
  | Bajaj
  | Sodexo
  | Unrecognised =>
    assets.waitcard
  }

/*
 * How the brand accessory behaves. Mirrors client-core's `LayoutTypes.cardBrandVisibility`
 * (Hidden | Animated | Standard | HideGeneric) without importing it — the library owns its own
 * vocabulary, and this is a polymorphic variant so genType emits a plain string union.
 */
@genType
type brandIconMode = [#standard | #animated | #hidden | #hideGeneric]

/* The placeholder cycle, in client-core's order. */
let placeholderCycle = ["visa", "mastercard", "americanexpress", "dinersclub", "discover", "jcb"]

/*
 * The brand mark shown inside the card-number field.
 *
 * `resizeMode: #contain` reproduces SVG's default `preserveAspectRatio="xMidYMid meet"`, which is
 * what client-core gets from `SvgUri`. The artwork has mixed aspect ratios (24x16, 40x24, 34x24,
 * square), so this matters.
 *
 * `#animated` reproduces `CardSchemeComponent.res` exactly: a 2000 ms delay, a 300 ms ease fade to
 * 0, advance the placeholder, a 300 ms ease fade back to 1, repeat — with opacity driven directly
 * and SCALE interpolated 0.8 -> 1.0 from the same value. There is no rotation in the source and
 * none here.
 */
@react.component
let make = (~detectedScheme: string, ~size: float=30., ~mode: brandIconMode=#standard) => {
  let hasBrand = detectedScheme->String.trim->String.length > 0

  let fadeAnim = CardAnimatedValue.useAnimatedValue(1.)
  let scaleAnim = fadeAnim->Animated.Value.interpolate({
    inputRange: [0., 1.],
    outputRange: [0.8, 1.]->Animated.Interpolation.fromFloatArray,
    extrapolate: #clamp,
  })

  /* Placeholder index + name, seeded exactly as client-core seeds it. */
  let ((_, placeholder), setPlaceholder) = React.useState(_ => (
    0,
    mode === #animated ? "visa" : "waitcard",
  ))

  let animationRef = React.useRef(None)

  let rec startContinuousAnimation = () => {
    let fadeOutSequence = Animated.sequence([
      Animated.delay(2000.),
      Animated.timing(
        fadeAnim,
        {
          toValue: 0.->Animated.Value.Timing.fromRawValue,
          duration: 300.,
          useNativeDriver: true,
          easing: Easing.ease,
        },
      ),
    ])

    animationRef.current = Some(fadeOutSequence)

    fadeOutSequence->Animated.start(~endCallback=endResult =>
      if endResult.finished {
        setPlaceholder(((index, _)) => {
          let newIndex = index === 5 ? 0 : index + 1
          (newIndex, placeholderCycle->Array.get(newIndex)->Option.getOr("waitcard"))
        })

        let fadeInAnimation = Animated.timing(
          fadeAnim,
          {
            toValue: 1.->Animated.Value.Timing.fromRawValue,
            duration: 300.,
            useNativeDriver: true,
            easing: Easing.ease,
          },
        )
        animationRef.current = Some(fadeInAnimation)
        fadeInAnimation->Animated.start(~endCallback=endResult =>
          if endResult.finished {
            startContinuousAnimation()
          }
        )
      }
    )
  }

  let stopAnimation = () =>
    switch animationRef.current {
    | Some(animation) => animation->Animated.stop
    | None => ()
    }

  /*
   * Same trigger and dependencies as client-core: cycle only while NO brand is detected, and stop
   * plus reset to full opacity the moment one is.
   *
   * One deliberate addition: the non-animated branch also stops and resets. client-core takes its
   * mode from static configuration and never changes it at runtime, so it cannot strand a partial
   * opacity/scale; a merchant CAN flip `brandIconMode` at runtime, and without this a mid-fade
   * switch to #standard would leave the icon stuck at 40% opacity.
   */
  React.useLayoutEffect2(() => {
    if mode === #animated && !hasBrand {
      startContinuousAnimation()
      Some(() => stopAnimation())
    } else {
      stopAnimation()
      fadeAnim->Animated.Value.setValue(1.)
      None
    }
  }, (detectedScheme, (mode :> string)))

  /* Belt and braces: never leave a timer running past unmount. */
  React.useEffect0(() => Some(() => stopAnimation()))

  /*
   * Visibility gate, matching client-core:
   *   cardBrandIcon !== Hidden && !(cardBrandIcon === HideGeneric && cardBrand === "")
   */
  let visible = switch mode {
  | #hidden => false
  | #hideGeneric => hasBrand
  | #standard | #animated => true
  }

  /* While a brand is known it always wins; otherwise the placeholder (cycling only in #animated). */
  let iconName = hasBrand ? detectedScheme : placeholder

  visible
    ? <Animated.View
        style={Style.s({
          opacity: fadeAnim->Animated.StyleProp.float,
          transform: [Style.scale(~scale=scaleAnim->Animated.StyleProp.float)],
        })}>
        <Image
          source={iconName->fromDetectedName->artworkFor}
          resizeMode=#contain
          style={Style.s({width: size->Style.dp, height: size->Style.dp})}
          accessible=false
        />
      </Animated.View>
    : React.null
}

/* The CVC hint glyph, rendered through CardFormView's existing `renderIcon` path. */
module Cvc = {
  @react.component
  let make = (~size: float=32.) =>
    <Image
      source={assets.cvv}
      resizeMode=#contain
      style={Style.s({width: size->Style.dp, height: size->Style.dp})}
      accessible=false
    />
}
