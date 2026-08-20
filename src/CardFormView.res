
open ReactNative
open Style

@react.component
let make = (~splitCardFields: bool=false, ~showCvcIcon: bool=true) => {
  let ctx = VaultWidgetContext.useRequired("CardFormView")
  let theme = ctx.theme
  let labels = ctx.labels
  let errors = ctx.controller.visibleErrors

  let renderError = message =>
    <VaultWidgetContext.ErrorText
      message
      theme
      errorFontSize=ctx.errorFontSize
      errorSpacing=ctx.errorSpacing
    />

  let perFieldError = splitCardFields ? Some(renderError) : Some(_ => React.null)

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
            renderError=?perFieldError
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
              renderError=?perFieldError
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
              renderError=?perFieldError
              borderTopWidth={splitCardFields ? theme.borderWidth : theme.borderWidth /. 2.}
              borderLeftWidth={splitCardFields ? theme.borderWidth : theme.borderWidth /. 2.}
              borderTopLeftRadius={splitCardFields ? theme.borderRadius : 0.}
              borderTopRightRadius={splitCardFields ? theme.borderRadius : 0.}
              borderBottomLeftRadius={splitCardFields ? theme.borderRadius : 0.}
            />
            <CardRenderIf condition={splitCardFields}>
              {switch errors.cvc {
              | Some(error) => renderError(error)
              | None =>
                switch errors.network {
                | Some(error) => renderError(error)
                | None => React.null
                }
              }}
            </CardRenderIf>
          </View>
        </View>
      </View>
      <CardRenderIf condition={!splitCardFields}>
        {switch errors.cardNumber {
        | Some(error) => renderError(error)
        | None =>
          switch errors.expiry {
          | Some(error) => renderError(error)
          | None =>
            switch errors.cvc {
            | Some(error) => renderError(error)
            | None =>
              switch errors.network {
              | Some(error) => renderError(error)
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
