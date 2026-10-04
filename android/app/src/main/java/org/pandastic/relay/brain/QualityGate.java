package org.pandastic.relay.brain;

import android.graphics.Bitmap;

/**
 * Rejects photos the classifier should not judge (contracts §2 step 1). Deliberately lenient:
 * a false RETAKE only costs a second photo, but the thresholds still need checking on the phone.
 */
public final class QualityGate {
    private static final int SIDE = 256;
    /** Variance of the Laplacian below this means the photo is too blurry. */
    static final double MIN_SHARPNESS = 40;
    /** Mean luminance (0–255) below this means too dark. */
    static final double MIN_LUMINANCE = 35;
    /** Share of blown-out pixels above this means too bright. A white background alone is fine. */
    static final double MAX_SATURATED = 0.6;

    private QualityGate() {}

    /** Returns null when the photo is usable, otherwise "blur", "dark" or "bright". */
    public static String check(Bitmap bitmap) {
        Bitmap small = Bitmap.createScaledBitmap(bitmap, SIDE, SIDE, true);
        int[] argb = new int[SIDE * SIDE];
        small.getPixels(argb, 0, SIDE, 0, 0, SIDE, SIDE);
        if (small != bitmap) small.recycle();
        return check(argb, SIDE);
    }

    /** Pure-Java core, so it can be unit-tested on the JVM. */
    static String check(int[] argb, int side) {
        double[] gray = new double[argb.length];
        double sum = 0;
        int saturated = 0;
        for (int i = 0; i < argb.length; i++) {
            int c = argb[i];
            gray[i] = 0.299 * ((c >> 16) & 0xFF) + 0.587 * ((c >> 8) & 0xFF) + 0.114 * (c & 0xFF);
            sum += gray[i];
            if (gray[i] > 250) saturated++;
        }
        if (sum / gray.length < MIN_LUMINANCE) return "dark";
        if ((double) saturated / gray.length > MAX_SATURATED) return "bright";

        double lapSum = 0, lapSquares = 0;
        int count = 0;
        for (int y = 1; y < side - 1; y++) {
            for (int x = 1; x < side - 1; x++) {
                int i = y * side + x;
                double lap = gray[i - 1] + gray[i + 1] + gray[i - side] + gray[i + side] - 4 * gray[i];
                lapSum += lap;
                lapSquares += lap * lap;
                count++;
            }
        }
        double lapMean = lapSum / count;
        double variance = lapSquares / count - lapMean * lapMean;
        return variance < MIN_SHARPNESS ? "blur" : null;
    }
}
