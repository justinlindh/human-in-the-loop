"""A framed browser badge whose joke remains readable in a close crop."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from era import *
reset()
parts = frame('browser_badge', 1.25, 0.62)
parts += [lettering('intro', 'Best viewed in', (0, -0.078, 0.43), 0.11),
          lettering('browser', 'Internet Exploder 6', (0, -0.078, 0.26), 0.112),
          box('status_strip', (0.9, 0.014, 0.026), (0, -0.080, 0.12), 'fabric_teal', 0.009)]
finish(parts, 'era_web2_badge')
