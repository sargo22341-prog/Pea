package com.peaportfolio.app;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * Ajoute le geste natif « tirer vers le bas pour recharger » à la WebView Capacitor.
 *
 * <p>L'indicateur circulaire classique d'Android suit le doigt pendant le geste, puis la page est
 * rechargée en ignorant le cache HTTP, comme un Ctrl+F5 sur un navigateur de bureau.
 */
final class PEAPullToRefresh {
  /** Fond du cercle : couleur « panel » de l'application. */
  private static final int SPINNER_BACKGROUND_COLOR = Color.rgb(16, 24, 31);
  /** Trait animé : couleur d'accent « mint » de l'application. */
  private static final int SPINNER_ACCENT_COLOR = Color.rgb(74, 222, 128);
  /** Distance classique entre le haut de la zone utile et le cercle en fin de geste. */
  private static final int SPINNER_TARGET_OFFSET_DP = 64;
  /** Garde-fou : l'indicateur s'arrête même si la WebView ne signale jamais la fin du chargement. */
  private static final long RELOAD_TIMEOUT_MS = 20_000L;

  private final SwipeRefreshLayout layout;
  private final WebView webView;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Runnable stopOnTimeout = this::stopRefreshing;

  private PEAPullToRefresh(SwipeRefreshLayout layout, WebView webView) {
    this.layout = layout;
    this.webView = webView;
  }

  /**
   * Insère un {@link SwipeRefreshLayout} entre la WebView et son parent.
   *
   * @return le contrôleur installé, ou {@code null} si la WebView n'est pas encore attachée.
   */
  static PEAPullToRefresh install(WebView webView) {
    if (!(webView.getParent() instanceof ViewGroup parent)) {
      return null;
    }

    int childIndex = parent.indexOfChild(webView);
    ViewGroup.LayoutParams parentLayoutParams = webView.getLayoutParams();
    parent.removeView(webView);

    SwipeRefreshLayout layout = new SwipeRefreshLayout(parent.getContext());
    layout.addView(webView, new SwipeRefreshLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    layout.setProgressBackgroundColorSchemeColor(SPINNER_BACKGROUND_COLOR);
    layout.setColorSchemeColors(SPINNER_ACCENT_COLOR);
    parent.addView(layout, childIndex, parentLayoutParams);

    PEAPullToRefresh controller = new PEAPullToRefresh(layout, webView);
    layout.setOnRefreshListener(controller::reloadIgnoringCache);
    controller.keepSpinnerBelowStatusBar();
    return controller;
  }

  /**
   * Permet à l'application web de suspendre le geste, par exemple pendant l'affichage d'une
   * fenêtre modale dont le contenu défile ou contient une saisie non enregistrée.
   */
  void setEnabled(boolean enabled) {
    layout.setEnabled(enabled);
    if (!enabled) {
      stopRefreshing();
    }
  }

  /**
   * Arrête l'indicateur et rétablit le cache normal une fois la page rechargée.
   *
   * <p>Le geste est réactivé car l'application web repart d'un état neuf : sans cela, une WebView
   * recréée alors qu'une fenêtre modale était ouverte laisserait le geste désactivé pour de bon.
   */
  void onPageFinished() {
    webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
    stopRefreshing();
    layout.setEnabled(true);
  }

  private void reloadIgnoringCache() {
    webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
    webView.reload();
    handler.removeCallbacks(stopOnTimeout);
    handler.postDelayed(stopOnTimeout, RELOAD_TIMEOUT_MS);
  }

  private void stopRefreshing() {
    handler.removeCallbacks(stopOnTimeout);
    if (layout.isRefreshing()) {
      layout.setRefreshing(false);
    }
  }

  /**
   * La fenêtre est affichée bord à bord : sans cet ajustement le cercle apparaîtrait sous la
   * barre de statut. Les encarts système sont relayés tels quels à la WebView.
   */
  private void keepSpinnerBelowStatusBar() {
    ViewCompat.setOnApplyWindowInsetsListener(layout, (view, insets) -> {
      int topInset = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
      layout.setProgressViewOffset(false, topInset - layout.getProgressCircleDiameter(), topInset + dpToPx(SPINNER_TARGET_OFFSET_DP));
      return insets;
    });
  }

  private int dpToPx(int dp) {
    return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp, layout.getResources().getDisplayMetrics()));
  }
}
