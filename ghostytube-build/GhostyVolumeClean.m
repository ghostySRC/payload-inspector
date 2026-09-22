#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <math.h>

static NSString * const kGhostyMultiplierKey = @"GhostyTubeVolumeMultiplier";
static const void *kGhostyBaseVolumeKey = &kGhostyBaseVolumeKey;
static const void *kGhostyButtonKey = &kGhostyButtonKey;
static const void *kGhostyPanelKey = &kGhostyPanelKey;
static const void *kGhostySliderKey = &kGhostySliderKey;
static const void *kGhostyLabelKey = &kGhostyLabelKey;

static CGFloat GhostyMultiplier(void) {
    double v = [[NSUserDefaults standardUserDefaults] doubleForKey:kGhostyMultiplierKey];
    if (v < 1.0 || v > 3.0) v = 1.0;
    return (CGFloat)v;
}
static void GhostySetMultiplier(CGFloat value) {
    value = MAX(1.0, MIN(3.0, value));
    [[NSUserDefaults standardUserDefaults] setDouble:value forKey:kGhostyMultiplierKey];
}
static NSMutableArray<Class> *gHookedVolumeClasses;
static NSMutableDictionary<NSString *, NSValue *> *gOriginalSetVolumeIMPs;
static NSString *GhostyClassKey(Class cls) { return NSStringFromClass(cls); }

static void GhostySetVolume(id self, SEL _cmd, float volume) {
    Class cls = object_getClass(self), matched = Nil;
    for (Class c in gHookedVolumeClasses) {
        Class walk = cls;
        while (walk) {
            if (walk == c) { matched = c; break; }
            walk = class_getSuperclass(walk);
        }
        if (matched) break;
    }
    if (!matched) return;
    objc_setAssociatedObject(self, kGhostyBaseVolumeKey, @(volume), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    IMP imp = [gOriginalSetVolumeIMPs[GhostyClassKey(matched)] pointerValue];
    if (!imp) return;
    float applied = volume * (float)GhostyMultiplier();
    applied = MAX(0.0f, MIN(4.0f, applied));
    ((void(*)(id,SEL,float))imp)(self, _cmd, applied);
}
static void HookVolumeClass(Class cls) {
    if (!cls) return;
    SEL sel = @selector(setVolume:);
    Method m = class_getInstanceMethod(cls, sel);
    if (!m) return;
    IMP original = method_getImplementation(m);
    const char *types = method_getTypeEncoding(m);
    if (class_addMethod(cls, sel, (IMP)GhostySetVolume, types)) {
        gOriginalSetVolumeIMPs[GhostyClassKey(cls)] = [NSValue valueWithPointer:original];
    } else {
        Method own = class_getInstanceMethod(cls, sel);
        IMP old = method_setImplementation(own, (IMP)GhostySetVolume);
        gOriginalSetVolumeIMPs[GhostyClassKey(cls)] = [NSValue valueWithPointer:old];
    }
    [gHookedVolumeClasses addObject:cls];
}

@interface GhostyVolumeTarget : NSObject
@property (nonatomic, weak) UIView *overlay;
@end

@implementation GhostyVolumeTarget
- (UIVisualEffect *)glassEffect {
    Class glass = NSClassFromString(@"UIGlassEffect");
    SEL s = NSSelectorFromString(@"effectWithStyle:");
    if (glass && [glass respondsToSelector:s]) {
        id (*send)(id, SEL, NSInteger) = (void *)objc_msgSend;
        return send(glass, s, 0);
    }
    return [UIBlurEffect effectWithStyle:UIBlurEffectStyleSystemThinMaterialDark];
}
- (UIButton *)makeButton {
    UIButton *b = [UIButton buttonWithType:UIButtonTypeSystem];
    b.accessibilityLabel = @"Ghosty volume";
    b.tintColor = UIColor.whiteColor;
    UIImage *image = [UIImage systemImageNamed:@"speaker.wave.3.fill"];
    Class cc = NSClassFromString(@"UIButtonConfiguration");
    SEL gs = NSSelectorFromString(@"clearGlassButtonConfiguration");
    if (cc && [cc respondsToSelector:gs]) {
        id (*send0)(id, SEL) = (void *)objc_msgSend;
        UIButtonConfiguration *cfg = send0(cc, gs);
        cfg.image = image;
        b.configuration = cfg;
    } else {
        [b setImage:image forState:UIControlStateNormal];
    }
    [b addTarget:self action:@selector(togglePanel:) forControlEvents:UIControlEventTouchUpInside];
    UILongPressGestureRecognizer *lp = [[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(resetVolume:)];
    lp.minimumPressDuration = 0.45;
    [b addGestureRecognizer:lp];
    return b;
}
- (UIView *)makePanel {
    UIVisualEffectView *p = [[UIVisualEffectView alloc] initWithEffect:[self glassEffect]];
    p.clipsToBounds = YES;
    p.layer.cornerRadius = 18.0;
    p.hidden = YES;
    UISlider *s = [UISlider new];
    s.minimumValue = 1.0f; s.maximumValue = 3.0f; s.value = (float)GhostyMultiplier();
    s.continuous = YES; s.accessibilityLabel = @"Ghosty volume multiplier";
    [s addTarget:self action:@selector(sliderChanged:) forControlEvents:UIControlEventValueChanged];
    UILabel *l = [UILabel new];
    l.textColor = UIColor.whiteColor;
    l.font = [UIFont systemFontOfSize:13 weight:UIFontWeightSemibold];
    l.textAlignment = NSTextAlignmentCenter;
    l.adjustsFontSizeToFitWidth = YES;
    [p.contentView addSubview:s]; [p.contentView addSubview:l];
    objc_setAssociatedObject(p, kGhostySliderKey, s, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(p, kGhostyLabelKey, l, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [self updateLabel:p];
    return p;
}
- (void)updateLabel:(UIView *)panel {
    UILabel *l = objc_getAssociatedObject(panel, kGhostyLabelKey);
    l.text = [NSString stringWithFormat:@"%.0f%%", GhostyMultiplier() * 100.0];
}
- (void)togglePanel:(UIButton *)sender {
    UIView *p = objc_getAssociatedObject(self.overlay, kGhostyPanelKey);
    if (!p) return;
    p.hidden = !p.hidden;
    UISlider *s = objc_getAssociatedObject(p, kGhostySliderKey);
    s.value = (float)GhostyMultiplier();
    [self updateLabel:p];
}
- (void)sliderChanged:(UISlider *)slider {
    CGFloat v = round(slider.value * 20.0) / 20.0;
    GhostySetMultiplier(v);
    [self updateLabel:objc_getAssociatedObject(self.overlay, kGhostyPanelKey)];
}
- (void)resetVolume:(UILongPressGestureRecognizer *)g {
    if (g.state != UIGestureRecognizerStateBegan) return;
    GhostySetMultiplier(1.0);
    UIView *p = objc_getAssociatedObject(self.overlay, kGhostyPanelKey);
    UISlider *s = objc_getAssociatedObject(p, kGhostySliderKey); s.value = 1.0f;
    [self updateLabel:p];
    [[[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleLight] impactOccurred];
}
@end

static IMP gOriginalLayout = NULL;
static GhostyVolumeTarget *gTarget;
static void GhostyLayoutSubviews(id self, SEL _cmd) {
    if (gOriginalLayout) ((void(*)(id,SEL))gOriginalLayout)(self,_cmd);
    UIView *o = self;
    if (o.bounds.size.width < 120 || o.bounds.size.height < 80) return;
    UIButton *b = objc_getAssociatedObject(o,kGhostyButtonKey);
    UIView *p = objc_getAssociatedObject(o,kGhostyPanelKey);
    if (!b) { gTarget.overlay=o; b=[gTarget makeButton]; [o addSubview:b]; objc_setAssociatedObject(o,kGhostyButtonKey,b,OBJC_ASSOCIATION_RETAIN_NONATOMIC); }
    if (!p) { gTarget.overlay=o; p=[gTarget makePanel]; [o addSubview:p]; objc_setAssociatedObject(o,kGhostyPanelKey,p,OBJC_ASSOCIATION_RETAIN_NONATOMIC); }
    CGFloat w=o.bounds.size.width,h=o.bounds.size.height;
    b.frame=CGRectMake(w-94,h-50,40,40);
    CGFloat pw=MIN(238,w-24),px=MAX(12,w-pw-12),py=MAX(8,h-116);
    p.frame=CGRectMake(px,py,pw,58);
    UISlider *s=objc_getAssociatedObject(p,kGhostySliderKey);
    UILabel *l=objc_getAssociatedObject(p,kGhostyLabelKey);
    s.frame=CGRectMake(14,8,MAX(100,pw-72),42); l.frame=CGRectMake(pw-58,8,52,42);
    [o bringSubviewToFront:p]; [o bringSubviewToFront:b];
}
static void HookOverlayClass(Class cls) {
    if (!cls) return;
    SEL sel=@selector(layoutSubviews); Method m=class_getInstanceMethod(cls,sel); if(!m)return;
    const char *types=method_getTypeEncoding(m); IMP inherited=method_getImplementation(m);
    if(class_addMethod(cls,sel,(IMP)GhostyLayoutSubviews,types)) gOriginalLayout=inherited;
    else gOriginalLayout=method_setImplementation(class_getInstanceMethod(cls,sel),(IMP)GhostyLayoutSubviews);
}
__attribute__((constructor)) static void GhostyTubeInit(void) {
    @autoreleasepool {
        gHookedVolumeClasses=[NSMutableArray array]; gOriginalSetVolumeIMPs=[NSMutableDictionary dictionary]; gTarget=[GhostyVolumeTarget new];
        HookVolumeClass(NSClassFromString(@"AVPlayer"));
        HookVolumeClass(NSClassFromString(@"AVAudioPlayer"));
        HookVolumeClass(NSClassFromString(@"AVAudioPlayerNode"));
        HookVolumeClass(NSClassFromString(@"AVSampleBufferAudioRenderer"));
        Class overlay=NSClassFromString(@"YTMainAppControlsOverlayView");
        if(!overlay) overlay=NSClassFromString(@"YTMainAppVideoPlayerOverlayView");
        HookOverlayClass(overlay);
    }
}

// PR build sync

// retrigger
