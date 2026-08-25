
open ReactNative
open Style

@react.component
let make = (
  ~splitCardFields: bool=false,
  ~showCvcIcon: bool=true,
  /* Grouped per-field styles for the ready-made form (ADR-0002 §9 layer 2). */
  ~fieldStyles: option<CardFieldStyles.formFieldStyles>=?,
) => {
  let ctx = VaultWidgetContext.useRequired("CardFormView")
  let theme = ctx.theme
  let labels = ctx.labels
  let errors = ctx.controller.visibleErrors

  let numberStyles = fieldStyles->CardFieldStyles.cardNumberOf
  let expiryStyles = fieldStyles->CardFieldStyles.expiryOf
  let cvcStyles = fieldStyles->CardFieldStyles.cvcOf

  /*
   * ERROR STYLE OWNERSHIP.
   *
   * In the SPLIT layout each field renders its own error, so each one uses its own `error` slot —
   * that is handled inside BoundCardFields and needs nothing here.
   *
   * In the FUSED layout the three fields share ONE error line at the bottom of the block, so a
   * single `error` style has to be chosen. The rule: the message belongs to a field, so the style
   * comes from that field. The network error is not owned by any field, so it falls back to the
   * card-number slot — the form's anchor field — and to the library default when that is unset.
   */
  let renderErrorWith = (errorStyle, message) =>
    <VaultWidgetContext.ErrorText
      message
      theme
      errorFontSize=ctx.errorFontSize
      errorSpacing=ctx.errorSpacing
      ?errorStyle
    />

  /*
   * Same shape as before: in the split layout each field renders its own message, in the fused
   * layout each field renders nothing and the shared line below does it. The only change is that
   * the split-layout renderer now carries THAT field's own `error` slot.
   */
  let perFieldError = (styles: option<CardFieldStyles.fieldStyles>) =>
    splitCardFields
      ? Some(message => renderErrorWith(styles->CardFieldStyles.errorOf, message))
      : Some(_ => React.null)

  <React.Fragment>
    <View style={s({marginBottom: theme.gap->dp})}>
      <View style={s({width: 100.->pct, borderRadius: theme.borderRadius})}>
        <View
          style={s({
            width: 100.->pct,
            marginBottom: ?(splitCardFields ? Some(theme.gap->dp) : None),
          })}>
          <BoundCardFields.Number
            ctx
            styles=?numberStyles
            renderError=?{perFieldError(numberStyles)}
            iconRight=CardInput.CustomIcon(
              <CardIcons detectedScheme=ctx.controller.values.brand mode=ctx.brandIconMode />,
            )
            borderBottomWidth=?{splitCardFields ? None : Some(theme.borderWidth /. 2.)}
            borderBottomLeftRadius=?{splitCardFields ? None : Some(0.)}
            borderBottomRightRadius=?{splitCardFields ? None : Some(0.)}
          />
        </View>
        <View
          style={s({
            flexDirection: labels.isRtl ? #"row-reverse" : #row,
            gap: ?(splitCardFields ? Some(theme.gap->dp) : None),
          })}>
          <View style={s({flex: 1.})}>
            <BoundCardFields.Expiry
              ctx
              styles=?expiryStyles
              renderError=?{perFieldError(expiryStyles)}
              borderTopWidth=?{splitCardFields ? None : Some(theme.borderWidth /. 2.)}
              borderRightWidth=?{splitCardFields ? None : Some(theme.borderWidth /. 2.)}
              borderTopLeftRadius=?{splitCardFields ? None : Some(0.)}
              borderTopRightRadius=?{splitCardFields ? None : Some(0.)}
              borderBottomRightRadius=?{splitCardFields ? None : Some(0.)}
            />
          </View>
          <View style={s({flex: 1.})}>
            <BoundCardFields.Cvc
              ctx
              styles=?cvcStyles
              renderError=?{perFieldError(cvcStyles)}
              borderTopWidth={splitCardFields ? theme.borderWidth : theme.borderWidth /. 2.}
              borderLeftWidth={splitCardFields ? theme.borderWidth : theme.borderWidth /. 2.}
              borderTopLeftRadius={splitCardFields ? theme.borderRadius : 0.}
              borderTopRightRadius={splitCardFields ? theme.borderRadius : 0.}
              borderBottomLeftRadius={splitCardFields ? theme.borderRadius : 0.}
            />
            <CardRenderIf condition={splitCardFields}>
              {switch errors.cvc {
              | Some(error) => renderErrorWith(cvcStyles->CardFieldStyles.errorOf, error)
              | None =>
                switch errors.network {
                | Some(error) => renderErrorWith(numberStyles->CardFieldStyles.errorOf, error)
                | None => React.null
                }
              }}
            </CardRenderIf>
          </View>
        </View>
      </View>
      <CardRenderIf condition={!splitCardFields}>
        {switch errors.cardNumber {
        | Some(error) => renderErrorWith(numberStyles->CardFieldStyles.errorOf, error)
        | None =>
          switch errors.expiry {
          | Some(error) => renderErrorWith(expiryStyles->CardFieldStyles.errorOf, error)
          | None =>
            switch errors.cvc {
            | Some(error) => renderErrorWith(cvcStyles->CardFieldStyles.errorOf, error)
            | None =>
              switch errors.network {
              | Some(error) => renderErrorWith(numberStyles->CardFieldStyles.errorOf, error)
              | None => React.null
              }
            }
          }
        }}
      </CardRenderIf>
    </View>
    {showCvcIcon ? React.null : React.null}
  </React.Fragment>
}
