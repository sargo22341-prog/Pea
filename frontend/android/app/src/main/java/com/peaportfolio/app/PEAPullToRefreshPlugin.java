package com.peaportfolio.app;

import android.app.Activity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Expose à l'application web la suspension du geste natif « tirer pour recharger », afin qu'un
 * rechargement accidentel ne détruise pas une saisie en cours dans une fenêtre modale.
 */
@CapacitorPlugin(name = "PEAPullToRefresh")
public class PEAPullToRefreshPlugin extends Plugin {
  @PluginMethod
  public void setEnabled(PluginCall call) {
    Boolean enabled = call.getBoolean("enabled");
    if (enabled == null) {
      call.reject("The 'enabled' flag is required.");
      return;
    }

    Activity activity = getActivity();
    if (!(activity instanceof MainActivity mainActivity)) {
      call.reject("Pull to refresh is not available on this activity.");
      return;
    }

    activity.runOnUiThread(() -> mainActivity.setPullToRefreshEnabled(enabled));
    call.resolve();
  }
}
