Pod::Spec.new do |s|
  s.name = 'CameraCutout'
  s.version = '1.0.0'
  s.summary = 'Passive window camera-cutout facts for Lukapp'
  s.description = 'Reports display cutouts and device facts without changing window insets.'
  s.license = { :type => 'Proprietary' }
  s.author = 'Lukapp'
  s.homepage = 'https://lukapp.app'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
