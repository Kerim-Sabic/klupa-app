# On-device models

Served from our own origin so the content security policy can stay `connect-src 'self'` for them and no video frame or landmark ever leaves the device.

## `pose_landmarker_lite.task`

| Field         | Value                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Source        | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`                |
| Downloaded    | 2026-11-11                                                                                                                                     |
| Size          | 5,777,746 bytes                                                                                                                                |
| SHA-256       | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`                                                                             |
| MD5           | `04a75ddf7c811ac7a1a4523266dd7d88` (matches the storage ETag and `x-goog-hash` at download)                                                    |
| Last-Modified | Thu, 27 Apr 2023 19:45:38 GMT (`x-goog-generation: 1682624738331272`)                                                                          |
| Publisher     | Google MediaPipe, BlazePose GHUM 3D lite. Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf |
| Licence       | Apache-2.0 (MediaPipe solutions models)                                                                                                        |
| Used by       | `src/features/shotlab/detector.ts` (Shot lab, `/shot`)                                                                                         |

## `efficientdet_lite0.tflite`

| Field         | Value                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Source        | `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite`              |
| Downloaded    | 2026-11-12                                                                                                                                  |
| Size          | 7,254,339 bytes                                                                                                                             |
| SHA-256       | `4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993`                                                                          |
| MD5           | `8df894b732bb95a58e0271b93dc65896` (matches the storage ETag and `x-goog-hash` at download)                                               |
| Last-Modified | Thu, 27 Apr 2023 22:53:34 GMT (`x-goog-generation: 1682636014261146`)                                                                       |
| Publisher     | Google MediaPipe, EfficientDet-Lite0 object detector (float16), trained on COCO. Paper: Tan, Pang, Le (2020), "EfficientDet", CVPR.         |
| Licence       | Apache-2.0 (MediaPipe solutions models)                                                                                                     |
| Used by       | `src/features/overlay/detector.ts` (Player overlay, `/overlay`). Asked for the `person` category only.                                    |

Check a copy with `Get-FileHash public/models/<file>` (PowerShell) or `sha256sum public/models/<file>`. Two unit tests (`src/features/shotlab/assets.test.ts`, `src/features/overlay/assets.test.ts`) fail if a byte of either file changes.
