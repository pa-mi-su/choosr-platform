package com.pamisu.choosr.push

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging

class ChoosrPushRegistrationModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun register(promise: Promise) {
    FirebaseMessaging.getInstance().register().addOnCompleteListener { registration ->
      if (!registration.isSuccessful) {
        Log.e(TAG, "FCM installation registration failed.", registration.exception)
        promise.reject(
          ERROR_REGISTRATION_FAILED,
          "Firebase Cloud Messaging registration failed.",
          registration.exception,
        )
        return@addOnCompleteListener
      }

      FirebaseInstallations.getInstance().id.addOnCompleteListener { installation ->
        if (installation.isSuccessful) {
          Log.i(TAG, "FCM installation registration succeeded.")
          promise.resolve(installation.result)
        } else {
          Log.e(TAG, "Firebase Installation ID retrieval failed.", installation.exception)
          promise.reject(
            ERROR_INSTALLATION_ID_FAILED,
            "Firebase Installation ID retrieval failed.",
            installation.exception,
          )
        }
      }
    }
  }

  private companion object {
    const val NAME = "ChoosrPushRegistration"
    const val TAG = "ChoosrPush"
    const val ERROR_REGISTRATION_FAILED = "push/registration-failed"
    const val ERROR_INSTALLATION_ID_FAILED = "push/installation-id-failed"
  }
}
