package com.pamisu.choosr.push

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.messaging.FirebaseMessaging

class ChoosrPushRegistrationModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun register(promise: Promise) {
    FirebaseMessaging.getInstance().token.addOnCompleteListener { registration ->
      if (!registration.isSuccessful || registration.result.isNullOrBlank()) {
        Log.e(TAG, "FCM token registration failed.", registration.exception)
        promise.reject(
          ERROR_REGISTRATION_FAILED,
          "Firebase Cloud Messaging registration failed.",
          registration.exception,
        )
        return@addOnCompleteListener
      }
      Log.i(TAG, "FCM token registration succeeded.")
      promise.resolve(registration.result)
    }
  }

  private companion object {
    const val NAME = "ChoosrPushRegistration"
    const val TAG = "ChoosrPush"
    const val ERROR_REGISTRATION_FAILED = "push/registration-failed"
  }
}
